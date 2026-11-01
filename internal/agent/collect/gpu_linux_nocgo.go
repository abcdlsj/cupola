//go:build linux && !cgo

package collect

import "github.com/abcdlsj/cupola/internal/model"

// NVIDIA GPU metrics need NVML (cgo). The default static build is CGO-free, so
// it reports no NVIDIA GPU; docs/DEPLOY.md explains the cgo build.
func nvidiaGPUs() []model.GPU { return nil }
