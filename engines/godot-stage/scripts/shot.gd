extends Node
## --shot=path.png after --shot-delay=2; quits unless --shot-keep
var _delay := 2.0
var _path := ""
var _t := 0.0
var _keep := false

func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shot="):
			_path = a.substr(7)
		if a.begins_with("--shot-delay="):
			_delay = float(a.substr(13))
		if a == "--shot-keep":
			_keep = true
	if _path.is_empty():
		set_process(false)

func _process(delta: float) -> void:
	_t += delta
	if _t < _delay:
		return
	var img := get_viewport().get_texture().get_image()
	var path := _path
	if path.begins_with("res://") or path.begins_with("user://"):
		path = ProjectSettings.globalize_path(path)
	img.save_png(path)
	print("[shot] wrote ", path)
	set_process(false)
	if not _keep:
		get_tree().quit(0)
