---
---

fix(electron): the local CLI route now forwards tools, tool choice, prior tool calls and results, images, system prompts and max tokens to non-native upstreams; Gemini upstreams authenticate with `x-goog-api-key` and take the model from the URL; a plain JSON reply to a streaming request is converted into the client's SSE events.
