//go:build !linux

package collect

import "github.com/abcdlsj/cupola/internal/model"

func (c *Collector) collectServices(*[]model.Service, func(string, error)) {}
