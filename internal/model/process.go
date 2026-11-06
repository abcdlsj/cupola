package model

// PruneProcesses drops kernel threads. They are children of kthreadd (pid 2),
// have no user, cgroup or memory and exist once per CPU core, so on an idle
// box they are the majority of a CPU-sorted top-N list while telling an
// operator nothing: they cannot be inspected, stopped or restarted.
func PruneProcesses(processes []Process) []Process {
	kept := make([]Process, 0, len(processes))
	for _, proc := range processes {
		if proc.PPID == KThreaddPID {
			continue
		}
		kept = append(kept, proc)
	}
	return kept
}

// KThreaddPID is the parent of every kernel thread (children of kthreadd).
const KThreaddPID = 2
