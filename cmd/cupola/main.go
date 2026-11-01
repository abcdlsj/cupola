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

	"github.com/abcdlsj/cupola/internal/agent"
	"github.com/abcdlsj/cupola/internal/hub"
	"github.com/abcdlsj/cupola/internal/version"
)

const usage = `Cupola: a clear view of every machine you run.

Usage:
  cupola <command> [flags]

Commands:
  agent     collect metrics and serve a read-only local API
  hub       poll agents, store history and serve the PWA
  serve     hub with an embedded local agent
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
	advertise := fs.String("advertise", "", "URL the hub should poll (default from the join command)")
	relayURL := fs.String("relay", "", "Bolthole relay URL; the hub reaches the agent through it")
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
	if *relayURL != "" {
		cfg.Relay.URL = *relayURL
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
