extends Node
## Records frame times for --bench-seconds=N then writes JSON and quits.

var _times: PackedFloat32Array = PackedFloat32Array()
var _elapsed: float = 0.0
var _warmup: float = 1.0
var _duration: float = 10.0
var _out: String = "user://bench.json"
var _label: String = "godot"
var _done: bool = false

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--bench-seconds="):
			_duration = float(a.substr(16))
		if a.begins_with("--bench-out="):
			_out = a.substr(12)
		if a.begins_with("--bench-label="):
			_label = a.substr(14)
		if a == "--no-bench":
			set_process(false)
			return
	print("[bench] warmup=%.1fs measure=%.1fs → %s" % [_warmup, _duration, _out])
	Engine.max_fps = 0
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)

func _process(delta: float) -> void:
	if _done:
		return
	_elapsed += delta
	if _elapsed < _warmup:
		return
	_times.append(delta * 1000.0)  # ms
	if _elapsed >= _warmup + _duration:
		_finish()

func _finish() -> void:
	_done = true
	var n := _times.size()
	if n == 0:
		push_error("[bench] no samples")
		get_tree().quit(1)
		return
	var sum := 0.0
	var mn := 1e9
	var mx := 0.0
	for t in _times:
		sum += t
		mn = minf(mn, t)
		mx = maxf(mx, t)
	var mean := sum / float(n)
	var sorted := _times.duplicate()
	sorted.sort()
	var p50 := sorted[int(n * 0.50)]
	var p95 := sorted[mini(n - 1, int(n * 0.95))]
	var fps := 1000.0 / mean if mean > 0.0 else 0.0
	var result := {
		"label": _label,
		"engine": "godot",
		"godot_version": Engine.get_version_info(),
		"samples": n,
		"warmup_s": _warmup,
		"duration_s": _duration,
		"fps_avg": fps,
		"frame_ms_avg": mean,
		"frame_ms_min": mn,
		"frame_ms_max": mx,
		"frame_ms_p50": p50,
		"frame_ms_p95": p95,
		"vsync": false,
		"resolution": [DisplayServer.window_get_size().x, DisplayServer.window_get_size().y],
		"ts": Time.get_datetime_string_from_system(true),
	}
	var text := JSON.stringify(result, "  ")
	# Resolve output path
	var path := _out
	if path.begins_with("res://") or path.begins_with("user://"):
		path = ProjectSettings.globalize_path(path)
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		# fallback next to project
		path = OS.get_executable_path().get_base_dir().path_join("bench-godot.json")
		f = FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_string(text)
		f.close()
		print("[bench] wrote ", path)
		print("[bench] fps_avg=%.1f frame_ms_avg=%.2f p95=%.2f samples=%s" % [fps, mean, p95, n])
	else:
		push_error("[bench] cannot write result")
		print(text)
	get_tree().quit(0)
