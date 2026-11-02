package updater

import "strings"

// Compare orders two version strings: -1 when a is older, 0 when equal and 1
// when a is newer. Tags may carry a leading "v", a "-prerelease" suffix sorts
// before its release and anything after "+" is ignored. A non-numeric segment
// counts as zero, so "dev" never beats a published version.
func Compare(a, b string) int {
	aNums, aPre := splitVersion(a)
	bNums, bPre := splitVersion(b)
	for i := 0; i < 3; i++ {
		x, y := 0, 0
		if i < len(aNums) {
			x = aNums[i]
		}
		if i < len(bNums) {
			y = bNums[i]
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	switch {
	case aPre == bPre:
		return 0
	case aPre == "":
		return 1
	case bPre == "":
		return -1
	case aPre < bPre:
		return -1
	default:
		return 1
	}
}

// Newer reports whether latest is a strictly newer release than current.
func Newer(latest, current string) bool {
	return Compare(latest, current) > 0
}

func splitVersion(raw string) ([]int, string) {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(strings.TrimPrefix(s, "v"), "V")
	if i := strings.IndexByte(s, '+'); i >= 0 {
		s = s[:i]
	}
	pre := ""
	if i := strings.IndexByte(s, '-'); i >= 0 {
		pre = s[i+1:]
		s = s[:i]
	}
	parts := strings.Split(s, ".")
	nums := make([]int, 0, 3)
	for _, part := range parts {
		n := 0
		for _, r := range part {
			if r < '0' || r > '9' {
				n = 0
				break
			}
			n = n*10 + int(r-'0')
		}
		nums = append(nums, n)
	}
	return nums, pre
}
