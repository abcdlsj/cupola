// Command cupola runs the Cupola hub, agent, or an all-in-one server.
//
// M0 ships the shell and the design system only: the subcommands are wired so
// the binary and the module layout exist, but collection and storage land in
// later milestones (see docs/PLAN.md).
package main

import (
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/abcdlsj/cupola/internal/version"
)

const usage = `Cupola: a clear view of every machine you run.

Usage:
  cupola <command> [flags]

Commands:
  agent     collect metrics and serve a read-only local API  (milestone M1)
  hub       poll agents, store history and serve the PWA      (milestone M2)
  serve     hub with an embedded local agent                  (milestone M2)
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
	case "agent", "hub", "serve":
		fs := flag.NewFlagSet(args[0], flag.ContinueOnError)
		fs.SetOutput(stderr)
		addr := fs.String("addr", "", "listen address")
		if err := fs.Parse(args[1:]); err != nil {
			return 2
		}
		fmt.Fprintf(stderr, "cupola %s: not implemented yet (M0 is the design gate; see docs/PLAN.md)\n", args[0])
		if *addr != "" {
			fmt.Fprintf(stderr, "requested address: %s\n", *addr)
		}
		return 1
	default:
		fmt.Fprintf(stderr, "cupola: unknown command %q\n\n", args[0])
		fmt.Fprint(stderr, usage)
		return 2
	}
}
