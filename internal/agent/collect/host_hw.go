package collect

import (
	"strings"

	"github.com/jaypipes/ghw"
)

// ghwCPUModel is the inventory string (marketing model name). ghw is optional:
// it can fail in containers and has to be cached, which the caller does.
func ghwCPUModel() string {
	cpu, err := ghw.CPU()
	if err != nil || cpu == nil || len(cpu.Processors) == 0 {
		return ""
	}
	parts := make([]string, 0, 2)
	for _, proc := range cpu.Processors {
		if proc.Model != "" {
			parts = append(parts, proc.Model)
			break
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return strings.TrimSpace(parts[0])
}
