package collect

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
	c.collectGPUsPlatform(out, warn)
	if len(*out) > 0 {
		c.gpus = append([]model.GPU(nil), (*out)...)
	}
}
