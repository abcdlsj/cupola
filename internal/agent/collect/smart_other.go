//go:build !linux

package collect

import "github.com/abcdlsj/cupola/internal/model"

func (c *Collector) collectSMART(*[]model.SMARTDevice, func(string, error)) {}
