package collect

import (
	"testing"

	"github.com/docker/docker/api/types/image"
)

func TestImagesFromKeepsSizesAndDropsTheDigestPrefix(t *testing.T) {
	got := imagesFrom([]image.Summary{
		{
			ID:         "sha256:9d3f21ac4b8e7f00112233445566778899aabbccddeeff0011223344556677",
			RepoTags:   []string{"jellyfin/jellyfin:10.10.3", "jellyfin/jellyfin:latest"},
			Size:       1180 << 20,
			SharedSize: 620 << 20,
			Containers: 2,
			Created:    1793000000,
		},
		{
			// A dangling image: no tag points at it any more.
			ID:         "sha256:5c2e88b0aa3700112233445566778899001122334455667788990011223344",
			RepoTags:   nil,
			Size:       890 << 20,
			SharedSize: 0,
		},
		{
			// Docker reports -1 when it did not count the containers.
			ID:         "sha256:1f70c9a4b21c0011223344556677889900112233445566778899001122334455",
			RepoTags:   []string{"ghcr.io/ggerganov/llama.cpp:server-cuda"},
			Size:       3210 << 20,
			SharedSize: 2640 << 20,
			Containers: -1,
		},
	})
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	first := got[0]
	if first.ID != "9d3f21ac4b8e" {
		t.Fatalf("ID = %q, want the 12-char short id", first.ID)
	}
	if first.RepoTag != "jellyfin/jellyfin:10.10.3" {
		t.Fatalf("RepoTag = %q", first.RepoTag)
	}
	if first.Size != 1180<<20 || first.SharedSize != 620<<20 {
		t.Fatalf("sizes = %d/%d", first.Size, first.SharedSize)
	}
	if first.Containers != 2 || first.Dangling {
		t.Fatalf("containers = %d dangling = %v", first.Containers, first.Dangling)
	}
	if first.CreatedAt != 1793000000*1000 {
		t.Fatalf("CreatedAt = %d, want milliseconds", first.CreatedAt)
	}
	if !got[1].Dangling || got[1].RepoTag != "<none>" {
		t.Fatalf("untagged image = %+v, want dangling with a <none> tag", got[1])
	}
	if got[2].Containers != 0 {
		t.Fatalf("containers = %d, want 0 for Docker's -1 placeholder", got[2].Containers)
	}
}

func TestImagesFromKeepsAnEmptyTagAsDangling(t *testing.T) {
	got := imagesFrom([]image.Summary{{ID: "sha256:abc", RepoTags: []string{""}, Size: 1}})
	if len(got) != 1 || !got[0].Dangling || got[0].RepoTag != "<none>" {
		t.Fatalf("got %+v", got)
	}
}
