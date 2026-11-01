//go:build !linux

package collect

import "github.com/abcdlsj/cupola/internal/model"

func (c *Collector) collectUpdates(**model.Updates, func(string, error)) {}
