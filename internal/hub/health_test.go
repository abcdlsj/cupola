package hub

import (
	"testing"

	"github.com/abcdlsj/cupola/internal/model"
)

func TestNodeHealthTableFigures(t *testing.T) {
	snap := &model.Snapshot{
		CPU: model.CPUStats{Percent: 40, Load1: 1.5, Load5: 1.2, Load15: 0.9},
		Network: []model.NetStats{
			{Iface: "lo", RxBps: 999, TxBps: 999},
			{Iface: "eth0", RxBps: 100, TxBps: 40},
			{Iface: "wg0", RxBps: 10, TxBps: 5},
		},
		Sensors: []model.Sensor{
			{Kind: "fan", Value: 1200},
			{Kind: "temperature", Value: 48},
			{Kind: "temperature", Value: 71.5},
		},
		GPUs: []model.GPU{{UtilPercent: 12}, {UtilPercent: 64}},
	}
	health := nodeHealth(model.NodeRecord{Status: "healthy"}, snap, 0, 0)
	if health.Load5 != 1.2 || health.Load15 != 0.9 {
		t.Fatalf("load = %v %v", health.Load5, health.Load15)
	}
	if health.NetRxBps != 110 || health.NetTxBps != 45 {
		t.Fatalf("net = %v %v, loopback must be excluded", health.NetRxBps, health.NetTxBps)
	}
	if health.TempMaxC == nil || *health.TempMaxC != 71.5 {
		t.Fatalf("temp = %v, want the hottest temperature sensor", health.TempMaxC)
	}
	if health.GPUPct == nil || *health.GPUPct != 64 {
		t.Fatalf("gpu = %v, want the busiest GPU", health.GPUPct)
	}

	bare := nodeHealth(model.NodeRecord{Status: "healthy"}, &model.Snapshot{}, 0, 0)
	if bare.TempMaxC != nil || bare.GPUPct != nil {
		t.Fatalf("a box without sensors or GPUs must report nil, got %v %v", bare.TempMaxC, bare.GPUPct)
	}
}
