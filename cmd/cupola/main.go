// Command cupola runs the agent, the hub, or an all-in-one server.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/abcdlsj/cupola/internal/agent"
	"github.com/abcdlsj/cupola/internal/hub"
	"github.com/abcdlsj/cupola/internal/updater"
	"github.com/abcdlsj/cupola/internal/version"
)

const usage = `Cupola: a clear view of every machine you run.

Usage:
  cupola <command> [flags]

Commands:
  agent     collect metrics and serve a read-only local API
  hub       poll agents, store history and serve the PWA
  serve     hub with an embedded local agent
  upgrade   install the release the hub requested (root; run by systemd)
  version   print version and build information

Run "cupola <command> -h" for the flags of a command.
`

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}

func run(args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprint(stderr, usage)
		return 2
	}
	switch args[0] {
	case "-h", "--help", "help":
		fmt.Fprint(stdout, usage)
		return 0
	case "version":
		fmt.Fprintln(stdout, version.Get().String())
		return 0
	case "agent":
		return runAgent(args[1:], stdout, stderr)
	case "hub":
		return runHub(args[1:], false, stdout, stderr)
	case "serve":
		return runHub(args[1:], true, stdout, stderr)
	case "upgrade":
		return runUpgrade(args[1:], stdout, stderr)
	default:
		fmt.Fprintf(stderr, "cupola: unknown command %q\n\n", args[0])
		fmt.Fprint(stderr, usage)
		return 2
	}
}

func logger(level string) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: lvl}))
}

func runAgent(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("agent", flag.ContinueOnError)
	fs.SetOutput(stderr)
	configPath := fs.String("config", "/etc/cupola/agent.json", "path to the agent config (0600)")
	initConfig := fs.Bool("init", false, "write a new config and token, then exit")
	nodeID := fs.String("node", "", "node id (with --init)")
	name := fs.String("name", "", "display name (with --init)")
	listen := fs.String("listen", "", "loopback listen address (with --init)")
	joinHub := fs.String("join", "", "hub URL to register with (one-time join code)")
	joinCode := fs.String("join-code", "", "one-time join code from the hub")
	advertise := fs.String("advertise", "", "URL the hub should poll; setting it keeps the agent in pull mode")
	pushURL := fs.String("push", "", "hub URL to report to (push mode: the hub cannot dial this host)")
	allowRemote := fs.Bool("allow-remote", false, "accept connections from outside loopback")
	level := fs.String("log-level", "info", "debug, info, warn or error")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *initConfig {
		if *nodeID == "" {
			fmt.Fprintln(stderr, "--init needs --node")
			return 2
		}
		if *name == "" {
			*name = *nodeID
		}
		if err := agent.InitConfig(*configPath, *nodeID, *name, *listen); err != nil {
			fmt.Fprintln(stderr, "init:", err)
			return 1
		}
		return 0
	}

	log := logger(*level)
	cfg, err := agent.LoadConfig(*configPath)
	if err != nil {
		fmt.Fprintln(stderr, "config:", err)
		return 1
	}
	if *joinHub != "" {
		cfg.JoinHub = *joinHub
		cfg.JoinCode = *joinCode
		cfg.JoinAdvertise = *advertise
		cfg.JoinMarker = *configPath + ".joined"
	}
	if *pushURL != "" {
		cfg.Push.Enabled = true
		cfg.Push.HubURL = *pushURL
	}
	if *advertise != "" && *pushURL == "" {
		cfg.Push.Enabled = false
		cfg.Push.HubURL = ""
	}
	if *allowRemote {
		cfg.AllowRemote = true
	}
	if *listen != "" && *initConfig == false {
		cfg.Listen = *listen
	}
	instance, err := agent.New(cfg, log)
	if err != nil {
		fmt.Fprintln(stderr, "agent:", err)
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := instance.Run(ctx); err != nil {
		log.Error("agent stopped", "error", err.Error())
		return 1
	}
	return 0
}

func runHub(args []string, embeddedAgent bool, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("hub", flag.ContinueOnError)
	fs.SetOutput(stderr)
	listen := fs.String("listen", "", "listen address (default from CUPOLA_LISTEN or 127.0.0.1:8080)")
	dataDir := fs.String("data-dir", "", "data directory (default from CUPOLA_DATA_DIR or ./data)")
	webDir := fs.String("web-dir", "", "directory with the built PWA (default web/dist)")
	level := fs.String("log-level", "info", "debug, info, warn or error")
	agentConfig := fs.String("agent-config", "", "agent config for --serve (default: embedded defaults)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	log := logger(*level)
	cfg := hub.Config{
		Listen:     *listen,
		DataDir:    *dataDir,
		WebDir:     *webDir,
		EmbedAgent: embeddedAgent,
		AgentConfig: *agentConfig,
		Logger:     log,
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server, err := hub.New(ctx, cfg)
	if err != nil {
		fmt.Fprintln(stderr, "hub:", err)
		log.Error("hub", "error", err.Error())
		return 1
	}
	if err := server.Run(ctx); err != nil {
		log.Error("hub stopped", "error", err.Error())
		return 1
	}
	return 0
}

// runUpgrade installs the release the hub wrote to its request file. It is the
// only privileged path: the hub runs unprivileged and cannot replace its own
// binary, so a root oneshot unit invokes this command when the request appears.
func runUpgrade(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("upgrade", flag.ContinueOnError)
	fs.SetOutput(stderr)
	requestPath := fs.String("request", "/var/lib/cupola/update.request", "request file written by the hub")
	resultPath := fs.String("result", "/var/lib/cupola/update.result", "result file the hub reads back")
	holdPath := fs.String("hold", "/var/lib/cupola/update.hold", "file that blocks retrying a rolled-back version")
	binPath := fs.String("bin", "/opt/cupola/cupola", "binary to replace")
	webDir := fs.String("web", "/opt/cupola/web", "built PWA directory to replace")
	service := fs.String("service", "cupola-hub", "systemd unit to restart")
	health := fs.String("health", "http://127.0.0.1:8080/healthz", "health URL polled after the restart")
	timeout := fs.Duration("timeout", 60*time.Second, "how long the health check may take")
	dryRun := fs.Bool("dry-run", false, "print the request and the target paths, install nothing")
	level := fs.String("log-level", "info", "debug, info, warn or error")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if *dryRun {
		request, err := updater.ReadRequest(*requestPath)
		if err != nil {
			fmt.Fprintln(stderr, "request:", err)
			return 1
		}
		fmt.Fprintf(stdout, "request  %s %s (%s)\n", request.Version, request.Asset, request.BaseURL)
		fmt.Fprintf(stdout, "bin      %s\nweb      %s\nservice  %s\nhealth   %s\n", *binPath, *webDir, *service, *health)
		return 0
	}
	if os.Geteuid() != 0 {
		fmt.Fprintln(stderr, "upgrade: must run as root: it replaces the binary and restarts the service")
		return 1
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result, err := updater.Install(ctx, updater.InstallOptions{
		RequestPath:  *requestPath,
		ResultPath:   *resultPath,
		HoldPath:     *holdPath,
		BinPath:      *binPath,
		WebDir:       *webDir,
		Service:      *service,
		HealthURL:    *health,
		ProbeTimeout: *timeout,
		Log:          logger(*level),
	})
	if err != nil {
		fmt.Fprintf(stderr, "upgrade %s: %s (%s)\n", result.Status, err, result.Detail)
		return 1
	}
	web := "binary only"
	if result.Web {
		web = "binary and web"
	}
	fmt.Fprintf(stdout, "%s → %s %s\n", result.From, result.To, web)
	return 0
}
