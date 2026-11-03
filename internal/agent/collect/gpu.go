package collect

import "time"

import "github.com/abcdlsj/cupola/internal/model"

// collectGPUs caches the platform GPU reading for 15 seconds.
func (c *Collector) collectGPUs(out *[]model.GPU, warn func(string, error)) {
	if !c.opts.GPU {
		return
	}
	if len(c.gpus) > 0 {
		*out = append(*out, c.gpus...)
		return
	}
	// A host without a GPU kept re-probing sysfs on every snapshot, which cost
	// about 7 % of a core on the VPS boxes. Remember the empty answer too.
	if time.Since(c.gpusAt) < gpuProbeInterval {
		return
	}
	c.gpusAt = time.Now()
	c.collectGPUsPlatform(out, warn)
	if len(*out) > 0 {
		c.gpus = append([]model.GPU(nil), (*out)...)
	}
}

// gpuProbeInterval is how often a GPU-less host looks again; a card can be
// passed through at any time, but not every five seconds.
const gpuProbeInterval = time.Minute
