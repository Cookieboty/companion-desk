extends Node3D
## Loads a VRM (0.x or 1.0) via godot-vrm, plays a simple idle/wave, drives look-at.

signal model_loaded(path: String, ok: bool)
signal anim_started(name: String)

@export var default_model: String = "res://assets/models/shibu-vrm0.vrm"
@export var look_target_path: NodePath = ^"LookTarget"

var _model: Node3D = null
var _skeleton: Skeleton3D = null
var _anim: AnimationPlayer = null
var _look_target: Node3D = null
var _head_idx: int = -1
var _neck_idx: int = -1
var _wave_t: float = -1.0
var _idle_t: float = 0.0
var _current_anim: String = "idle"
var _model_path: String = ""

func _ready() -> void:
	_look_target = get_node_or_null(look_target_path)
	var path := default_model
	# CLI: --model=res://... or absolute path
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--model="):
			path = a.substr(8)
	var anim := "idle"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--anim="):
			anim = a.substr(7)
	load_model(path)
	play_anim(anim)

func load_model(path: String) -> bool:
	if not path.is_empty() and not path.begins_with("res://") and not path.begins_with("user://"):
		# Allow absolute / relative filesystem paths via Godot's globalize
		if path.is_absolute_path() or path.begins_with("/") or path.contains(":"):
			pass
		elif FileAccess.file_exists(path):
			path = ProjectSettings.globalize_path(path)
	print("[stage] loading ", path)
	var node := _load_vrm(path)
	if node == null:
		push_error("[stage] failed to load %s" % path)
		model_loaded.emit(path, false)
		return false
	if _model:
		_model.queue_free()
		_model = null
	_model = node
	_model_path = path
	add_child(_model)
	_model.position = Vector3(0, 0, 0)
	_bind_skeleton(_model)
	_ensure_anims()
	print("[stage] loaded ok; skeleton=", _skeleton != null, " head=", _head_idx, " neck=", _neck_idx)
	model_loaded.emit(path, true)
	return true

func play_anim(name: String) -> void:
	_current_anim = name
	_idle_t = 0.0
	if name == "wave":
		_wave_t = 0.0
	else:
		_wave_t = -1.0
	if _anim and _anim.has_animation(name):
		_anim.play(name)
	anim_started.emit(name)
	print("[stage] play_anim ", name)

func set_look_at(world: Vector3) -> void:
	if _look_target:
		_look_target.global_position = world

func get_status() -> Dictionary:
	return {
		"model": _model_path,
		"anim": _current_anim,
		"has_skeleton": _skeleton != null,
		"head_bone": _head_idx,
	}

func _process(delta: float) -> void:
	_idle_t += delta
	if _model and _current_anim == "idle":
		# Subtle breathing sway on root
		_model.rotation.y = sin(_idle_t * 0.6) * 0.05
		_model.position.y = sin(_idle_t * 1.2) * 0.01
	if _wave_t >= 0.0 and _skeleton:
		_wave_t += delta
		var wave := sin(_wave_t * 6.0) * 0.6
		_pose_arm_wave(wave)
		if _wave_t > 2.2:
			_wave_t = -1.0
			_current_anim = "idle"
	_apply_look_at()

func _pose_arm_wave(wave: float) -> void:
	# Try common humanoid bone names after VRM import
	var candidates := ["RightUpperArm", "J_Bip_R_UpperArm", "UpperArm_R", "arm_R"]
	for n in candidates:
		var i := _skeleton.find_bone(n)
		if i < 0:
			continue
		var basis := Basis(Vector3(0, 0, 1), -1.1 + wave * 0.5) * Basis(Vector3(1, 0, 0), 0.3)
		_skeleton.set_bone_pose_rotation(i, basis.get_rotation_quaternion())
		return
	# Fallback: any bone with "UpperArm" and R
	for i in _skeleton.get_bone_count():
		var n: String = _skeleton.get_bone_name(i)
		if "UpperArm" in n and ("R" in n or "r" == n.right(1)):
			var basis := Basis(Vector3(0, 0, 1), -1.1 + wave * 0.5)
			_skeleton.set_bone_pose_rotation(i, basis.get_rotation_quaternion())
			return

func _apply_look_at() -> void:
	if _skeleton == null or _look_target == null or _head_idx < 0:
		return
	var head_tf := _skeleton.global_transform * _skeleton.get_bone_global_pose(_head_idx)
	var to := _look_target.global_position - head_tf.origin
	if to.length_squared() < 0.0001:
		return
	# Limit yaw/pitch toward target in head-local space
	var local_dir := head_tf.basis.inverse() * to.normalized()
	var yaw := clampf(atan2(-local_dir.x, -local_dir.z), -0.6, 0.6)
	var pitch := clampf(asin(clampf(local_dir.y, -1.0, 1.0)), -0.4, 0.4)
	var q := Quaternion(Vector3.UP, yaw) * Quaternion(Vector3.RIGHT, pitch)
	_skeleton.set_bone_pose_rotation(_head_idx, q)
	if _neck_idx >= 0:
		var nq := Quaternion(Vector3.UP, yaw * 0.35) * Quaternion(Vector3.RIGHT, pitch * 0.35)
		_skeleton.set_bone_pose_rotation(_neck_idx, nq)

func _bind_skeleton(root: Node) -> void:
	_skeleton = null
	_anim = null
	_head_idx = -1
	_neck_idx = -1
	_skeleton = _find_skeleton(root)
	_anim = root.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if _skeleton == null:
		return
	for name in ["Head", "head", "J_Bip_C_Head"]:
		_head_idx = _skeleton.find_bone(name)
		if _head_idx >= 0:
			break
	if _head_idx < 0:
		for i in _skeleton.get_bone_count():
			if _skeleton.get_bone_name(i).to_lower().contains("head"):
				_head_idx = i
				break
	for name in ["Neck", "neck", "J_Bip_C_Neck"]:
		_neck_idx = _skeleton.find_bone(name)
		if _neck_idx >= 0:
			break

func _find_skeleton(n: Node) -> Skeleton3D:
	if n is Skeleton3D:
		return n
	for c in n.get_children():
		var s := _find_skeleton(c)
		if s:
			return s
	return null

func _ensure_anims() -> void:
	# Procedural idle/wave are driven in _process; AnimationPlayer optional.
	pass

func _load_vrm(path: String) -> Node3D:
	var gltf := GLTFDocument.new()
	var vrm_extension: GLTFDocumentExtension = load("res://addons/vrm/vrm_extension.gd").new()
	gltf.register_gltf_document_extension(vrm_extension, true)
	var state := GLTFState.new()
	# IMPORT_GENERATE_TANGENT_ARRAYS = 8
	var err := gltf.append_from_file(path, state, 8)
	if err != OK:
		gltf.unregister_gltf_document_extension(vrm_extension)
		push_error("[stage] append_from_file err=%s path=%s" % [err, path])
		return null
	var generated: Node3D = gltf.generate_scene(state) as Node3D
	gltf.unregister_gltf_document_extension(vrm_extension)
	return generated
