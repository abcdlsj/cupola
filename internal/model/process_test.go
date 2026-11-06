package model

import "testing"

func TestPruneProcessesDropsKernelThreads(t *testing.T) {
	processes := []Process{
		{PID: 1, PPID: 0, Name: "systemd", User: "root", RSSBytes: 13 << 20},
		{PID: 16, PPID: KThreaddPID, Name: "ksoftirqd/0", Cgroup: "/"},
		{PID: 22, PPID: KThreaddPID, Name: "kworker/0:0H-events_highpri", Cgroup: "/"},
		{PID: 3376, PPID: 1, Name: "cupola", User: "root", RSSBytes: 19 << 20},
	}
	got := PruneProcesses(processes)
	if len(got) != 2 {
		t.Fatalf("kept %d processes, want 2: %+v", len(got), got)
	}
	for _, proc := range got {
		if proc.PPID == KThreaddPID {
			t.Errorf("kernel thread survived: %s", proc.Name)
		}
	}
}
