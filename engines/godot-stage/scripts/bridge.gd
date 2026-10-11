extends Node
## Minimal TCP JSON-lines bridge (AIRI-inspired stub).
## Default port 8765. One JSON object per line, UTF-8, newline-terminated.
##
## Commands (client → Godot):
##   {"cmd":"load","path":"res://assets/models/shibu-vrm0.vrm"}
##   {"cmd":"play","name":"idle"|"wave"}
##   {"cmd":"lookAt","x":0.2,"y":1.4,"z":0.5}
##   {"cmd":"ping"}
##   {"cmd":"status"}
##
## Note: Godot's WebSocketMultiplayerPeer speaks a multiplayer framing protocol,
## not raw JSON WebSocket text frames. This spike uses TCP JSON-lines so Electron
## (or `nc` / Python) can talk without a multiplayer peer. A true WS upgrade can
## wrap the same command set later.

@export var port: int = 8765
@export var stage_path: NodePath = ^"../Stage"

var _server: TCPServer = TCPServer.new()
var _stage: Node = null
var _clients: Array = []  # {peer: StreamPeerTCP, buf: String}

func _ready() -> void:
	_stage = get_node_or_null(stage_path)
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--port="):
			port = int(a.substr(7))
		if a == "--no-bridge":
			print("[bridge] disabled")
			set_process(false)
			return
	var err := _server.listen(port)
	if err != OK:
		push_error("[bridge] listen(%s) failed: %s" % [port, err])
		return
	print("[bridge] TCP JSON-lines listening on port %s" % port)

func _process(_dt: float) -> void:
	while _server.is_connection_available():
		var peer := _server.take_connection()
		peer.set_no_delay(true)
		_clients.append({"peer": peer, "buf": ""})
		print("[bridge] client connected")
		_send_peer(peer, {"ok": true, "event": "welcome", "proto": 1, "transport": "tcp-jsonl"})
	var i := 0
	while i < _clients.size():
		var c: Dictionary = _clients[i]
		var peer: StreamPeerTCP = c["peer"]
		peer.poll()
		var st := peer.get_status()
		if st != StreamPeerTCP.STATUS_CONNECTED:
			print("[bridge] client disconnected")
			_clients.remove_at(i)
			continue
		var avail := peer.get_available_bytes()
		if avail > 0:
			var chunk := peer.get_utf8_string(avail)
			c["buf"] = str(c["buf"]) + chunk
			while true:
				var buf: String = c["buf"]
				var nl := buf.find("\n")
				if nl < 0:
					break
				var line := buf.substr(0, nl).strip_edges()
				c["buf"] = buf.substr(nl + 1)
				if not line.is_empty():
					_handle(peer, line)
		i += 1

func _handle(peer: StreamPeerTCP, text: String) -> void:
	var data = JSON.parse_string(text)
	if typeof(data) != TYPE_DICTIONARY:
		_send_peer(peer, {"ok": false, "error": "expected JSON object"})
		return
	var cmd: String = str(data.get("cmd", ""))
	match cmd:
		"ping":
			_send_peer(peer, {"ok": true, "cmd": "pong"})
		"status":
			var st: Dictionary = {}
			if _stage and _stage.has_method("get_status"):
				st = _stage.get_status()
			_send_peer(peer, {"ok": true, "status": st})
		"load":
			var path := str(data.get("path", ""))
			if path.is_empty() or _stage == null:
				_send_peer(peer, {"ok": false, "error": "missing path/stage"})
			else:
				var ok: bool = _stage.load_model(path)
				_send_peer(peer, {"ok": ok, "cmd": "load", "path": path})
		"play":
			var name := str(data.get("name", "idle"))
			if _stage:
				_stage.play_anim(name)
			_send_peer(peer, {"ok": true, "cmd": "play", "name": name})
		"lookAt":
			if _stage:
				_stage.set_look_at(Vector3(
					float(data.get("x", 0.0)),
					float(data.get("y", 1.4)),
					float(data.get("z", 0.8)),
				))
			_send_peer(peer, {"ok": true, "cmd": "lookAt"})
		_:
			_send_peer(peer, {"ok": false, "error": "unknown cmd", "cmd": cmd})

func _send_peer(peer: StreamPeerTCP, obj: Dictionary) -> void:
	var text := JSON.stringify(obj) + "\n"
	peer.put_data(text.to_utf8_buffer())
