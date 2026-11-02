package collect

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"

	"github.com/abcdlsj/cupola/internal/model"
)

// collectContainers uses the official Docker client over the unix socket.
// Podman works through its Docker-compatible socket (DOCKER_HOST). The Docker
// socket is root-equivalent; docs/DEPLOY.md says so.
func (c *Collector) collectContainers(ctx context.Context, out *[]model.Container, images *[]model.Image, warn func(string, error)) {
	if !c.opts.Docker {
		return
	}
	if time.Since(c.containersAt) < 15*time.Second {
		*out = append(*out, c.containers...)
		*images = append(*images, c.images...)
		return
	}
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		c.dockerWarning(warn, err)
		return
	}
	defer cli.Close()

	list, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		c.dockerWarning(warn, err)
		return
	}
	pids := make(map[int32]string, len(list))
	containers := make([]model.Container, 0, len(list))
	for _, item := range list {
		name := ""
		if len(item.Names) > 0 {
			name = strings.TrimPrefix(item.Names[0], "/")
		}
		entry := model.Container{
			ID:     shortID(item.ID),
			Name:   name,
			Image:  item.Image,
			State:  item.State,
			Status: item.Status,
		}
		for _, port := range item.Ports {
			if port.PublicPort == 0 {
				continue
			}
			entry.Ports = append(entry.Ports, fmt.Sprintf("%s:%d->%d/%s", port.IP, port.PublicPort, port.PrivatePort, port.Type))
		}
		if item.State == "running" {
			if stats, err := oneShotStats(ctx, cli, item.ID); err == nil {
				entry.CPUPercent, entry.MemBytes, entry.MemLimit = stats.cpu, stats.mem, stats.limit
			}
			if inspect, err := cli.ContainerInspect(ctx, item.ID); err == nil {
				entry.Restarts = inspect.RestartCount
				if inspect.State != nil {
					if inspect.State.Pid > 0 {
						pids[int32(inspect.State.Pid)] = name
					}
					if started, err := time.Parse(time.RFC3339Nano, inspect.State.StartedAt); err == nil {
						entry.UptimeSec = int64(time.Since(started).Seconds())
					}
				}
			}
		}
		containers = append(containers, entry)
	}
	c.containerPids = pids
	c.containers = containers
	c.containersAt = time.Now()
	*images = append(*images, c.collectImages(ctx, cli, warn)...)
	*out = append(*out, containers...)
}

// collectImages lists the image cache. The list is slower than the container
// list on a big host, so it is cached for a minute; the disk cost does not move
// between two five-second polls anyway.
func (c *Collector) collectImages(ctx context.Context, cli *client.Client, warn func(string, error)) []model.Image {
	if time.Since(c.imagesAt) < time.Minute {
		return c.images
	}
	list, err := cli.ImageList(ctx, image.ListOptions{})
	if err != nil {
		c.dockerWarning(warn, err)
		return c.images
	}
	c.images = imagesFrom(list)
	c.imagesAt = time.Now()
	return c.images
}

// imagesFrom maps the Docker client's summaries to the snapshot rows. It is
// separate from the client so the mapping is testable without a daemon.
func imagesFrom(list []image.Summary) []model.Image {
	out := make([]model.Image, 0, len(list))
	for _, item := range list {
		repoTag := "<none>"
		if len(item.RepoTags) > 0 && item.RepoTags[0] != "" {
			repoTag = item.RepoTags[0]
		}
		containers := item.Containers
		if containers < 0 {
			containers = 0
		}
		out = append(out, model.Image{
			ID:         shortID(strings.TrimPrefix(item.ID, "sha256:")),
			RepoTag:    repoTag,
			Size:       item.Size,
			SharedSize: item.SharedSize,
			Containers: containers,
			Dangling:   repoTag == "<none>",
			CreatedAt:  item.Created * 1000,
		})
	}
	return out
}

func (c *Collector) dockerWarning(warn func(string, error), err error) {
	// A missing socket is normal (no Docker on this host); do not repeat the
	// warning on every poll.
	if time.Since(c.dockerWarnAt) < 10*time.Minute {
		return
	}
	c.dockerWarnAt = time.Now()
	warn("containers", err)
}

func (c *Collector) containerForPID(pid int32) string {
	if c.containerPids == nil {
		return ""
	}
	return c.containerPids[pid]
}

func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}

type containerStat struct {
	cpu   float64
	mem   uint64
	limit uint64
}

func oneShotStats(ctx context.Context, cli *client.Client, id string) (containerStat, error) {
	reader, err := cli.ContainerStatsOneShot(ctx, id)
	if err != nil {
		return containerStat{}, err
	}
	defer reader.Body.Close()
	var stats container.StatsResponse
	if err := json.NewDecoder(reader.Body).Decode(&stats); err != nil {
		return containerStat{}, err
	}
	out := containerStat{
		mem:   stats.MemoryStats.Usage,
		limit: stats.MemoryStats.Limit,
	}
	cpuDelta := float64(stats.CPUStats.CPUUsage.TotalUsage) - float64(stats.PreCPUStats.CPUUsage.TotalUsage)
	systemDelta := float64(stats.CPUStats.SystemUsage) - float64(stats.PreCPUStats.SystemUsage)
	online := stats.CPUStats.OnlineCPUs
	if online == 0 {
		online = uint32(len(stats.CPUStats.CPUUsage.PercpuUsage))
	}
	if systemDelta > 0 && cpuDelta > 0 && online > 0 {
		out.cpu = cpuDelta / systemDelta * float64(online) * 100
	}
	return out, nil
}
