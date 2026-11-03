package collect

import (
	"strings"
	"time"

	"github.com/shirou/gopsutil/v4/sensors"

	"github.com/abcdlsj/cupola/internal/model"
)

// sensorProbeInterval is how often a host without sensors looks again.
const sensorProbeInterval = time.Minute

// collectSensors reports temperatures and fans. gopsutil reads hwmon on Linux
// and the SMC on macOS; a host with neither yields an empty list, not an error.
func (c *Collector) collectSensors(out *[]model.Sensor, warn func(string, error)) {
	if len(c.sensors) > 0 {
		*out = append(*out, c.sensors...)
		return
	}
	// Every VPS is sensor-less, and the probe walks sysfs. Remember the empty
	// answer for a minute instead of scanning on every snapshot.
	if time.Since(c.sensorsAt) < sensorProbeInterval {
		return
	}
	c.sensorsAt = time.Now()
	temps, err := sensors.SensorsTemperatures()
	if err != nil {
		warn("sensors", err)
	}
	list := make([]model.Sensor, 0, len(temps))
	for _, temp := range temps {
		if temp.Temperature == 0 {
			continue
		}
		chip, label := splitSensorKey(temp.SensorKey)
		list = append(list, model.Sensor{
			Chip:  chip,
			Label: label,
			Kind:  "temperature",
			Value: round1(temp.Temperature),
			Unit:  "°C",
			Max:   round1(temp.High),
			Crit:  round1(temp.Critical),
		})
	}
	c.sensors = list
	*out = append(*out, list...)
}

func splitSensorKey(key string) (string, string) {
	key = strings.TrimSpace(key)
	if key == "" {
		return "sensor", "sensor"
	}
	parts := strings.Split(key, "/")
	if len(parts) >= 2 {
		return parts[0], strings.Join(parts[1:], " ")
	}
	return key, key
}

func round1(value float64) float64 {
	return float64(int(value*10+0.5)) / 10
}
