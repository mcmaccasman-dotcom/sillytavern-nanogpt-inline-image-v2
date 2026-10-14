# NanoGPT Inline Scene Images for SillyTavern

A third-party SillyTavern UI extension that turns recent roleplay context into a scene image and appends the result as an inline image message in the active chat.

## Features

- Summarizes the most recent 2–30 chat messages and writes a visual prompt with a NanoGPT text model.
- Optionally reads the active character card's name, description, personality, and scenario. It also attempts to include group members' cards.
- Automatically loads the active character's SillyTavern portrait (and group members' portraits where available), resizes each in the browser, and sends it as an image reference. This can be switched off in the extension settings.
- Stores named image references in this browser's IndexedDB. Select one or more to send as image inputs; names are included as identity cues in the generated prompt.
- Uses NanoGPT's OpenAI-compatible chat-completions API for the scene prompt and image-generation API for image output.
- Adds the generated image to the current chat as a new assistant-style message.
- Keeps the API key in browser `localStorage`, not in SillyTavern's extension settings JSON.

## Install

1. Copy the `sillytavern-nanogpt-inline-image` folder into SillyTavern's `public/scripts/extensions/third-party/` directory. Alternatively, host this folder in a Git repository and install its repository URL through **Extensions → Install Extension**.
2. Restart or refresh SillyTavern and enable **NanoGPT Inline Scene Images** in the Extensions panel.
3. Paste your NanoGPT API key into the extension's password field.
4. Set a NanoGPT image model ID and text model ID. Defaults are `hidream` for images and `minimax/minimax-m2.7` for summarization/prompt writing; change them to models enabled for your account.
5. Optionally add named reference images, select the ones to use, and click **Generate image in chat**.

## Settings and data handling

The API key is stored in this browser profile's `localStorage` under `nanogpt_inline_scene_images_api_key`. Clear the field to remove it from this browser. Reference images are stored in browser IndexedDB and can be removed individually. Other preferences are saved using SillyTavern extension settings.

When generating, the extension sends the selected recent chat text, enabled character-card details, any extra direction, chosen named reference images, and active character portraits (unless portrait sending is disabled) to NanoGPT. Requests are made from the browser directly to NanoGPT. NanoGPT may charge for text and image generation. Use only content you are comfortable sending to that service.

Generated images are embedded in the chat message, so chat files can become larger. This version requests base64 image output to avoid short-lived image links.

## Troubleshooting

- **CORS/network error:** NanoGPT must allow browser requests from the origin serving your SillyTavern instance. If the browser blocks the request, the provider or a small trusted server-side proxy must enable CORS; do not paste your API key into an untrusted proxy.
- **Model error:** Use a model ID listed/enabled by NanoGPT. The `size` and `quality` fields are model-specific; leave quality blank if unsupported and change the image size to a value accepted by the chosen image model.
- **Image appears as broken link:** The extension stores image responses inline. Confirm the selected model returns `b64_json` or `url` in the OpenAI-compatible generation response.
- **Older SillyTavern version:** This was built against the current UI-extension conventions and tested for JavaScript syntax, but has not been run inside your SillyTavern instance.

## API/documentation references

- [SillyTavern extension development guide](https://docs.sillytavern.app/for-contributors/writing-extensions/)
- [NanoGPT OpenAI-compatible image generation](https://docs.nano-gpt.com/api-reference/endpoint/image-generation-openai)
- [NanoGPT chat completion](https://docs.nano-gpt.com/api-reference/endpoint/chat-completion)
