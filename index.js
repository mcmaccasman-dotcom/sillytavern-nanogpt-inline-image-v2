(() => {
    'use strict';

    const EXTENSION_KEY = 'nanogpt_inline_scene_images';
    const API_KEY_STORAGE = 'nanogpt_inline_scene_images_api_key';
    const DB_NAME = 'nanogpt-inline-scene-images';
    const DB_STORE = 'references';
    const API_ROOT = 'https://api.nano-gpt.com/api/v1';
    const defaults = {
        imageModel: 'hidream',
        textModel: 'minimax/minimax-m2.7',
        recentMessages: 6,
        includeAppearance: true,
        includePortraits: true,
        resolution: '1024x1024',
        imageQuality: '',
        referenceIds: [],
    };

    let busy = false;
    let dbPromise;

    function context() {
        return window.SillyTavern?.getContext?.();
    }

    function settings() {
        const ctx = context();
        if (!ctx) throw new Error('SillyTavern context is not available yet.');
        ctx.extensionSettings ??= {};
        ctx.extensionSettings[EXTENSION_KEY] ??= structuredClone(defaults);
        const result = ctx.extensionSettings[EXTENSION_KEY];
        for (const [key, value] of Object.entries(defaults)) {
            if (!(key in result)) result[key] = structuredClone(value);
        }
        return result;
    }

    function saveSettings() {
        context()?.saveSettingsDebounced?.();
    }

    function openDb() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE, { keyPath: 'id' });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        return dbPromise;
    }

    async function dbRequest(mode, action) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, mode);
            const store = tx.objectStore(DB_STORE);
            const request = action(store);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    const listReferences = () => dbRequest('readonly', store => store.getAll());
    const getReference = id => dbRequest('readonly', store => store.get(id));
    const putReference = row => dbRequest('readwrite', store => store.put(row));
    const deleteReference = id => dbRequest('readwrite', store => store.delete(id));

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    }

    function rootElement() {
        return document.getElementById('nanogpt_inline_scene_images_root');
    }

    function setStatus(text, isError = false) {
        const node = rootElement()?.querySelector('.ngsi-status');
        if (!node) return;
        node.textContent = text;
        node.classList.toggle('ngsi-error', isError);
    }

    function setBusy(value) {
        busy = value;
        const button = rootElement()?.querySelector('.ngsi-generate');
        if (button) {
            button.disabled = value;
            button.textContent = value ? 'Summarizing and generating…' : 'Generate image in chat';
        }
    }

    function apiKey() {
        return localStorage.getItem(API_KEY_STORAGE) || '';
    }

    function makePanel() {
        const host = document.getElementById('extensions_settings');
        if (!host || rootElement()) return;
        const current = settings();
        const section = document.createElement('div');
        section.id = 'nanogpt_inline_scene_images_root';
        section.className = 'extension_settings';
        section.innerHTML = `
          <div class="inline-drawer">
            <div class="inline-drawer-header"><b>NanoGPT Inline Scene Images</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div></div>
            <div class="inline-drawer-content">
              <label class="ngsi-field">NanoGPT API key <input class="text_pole ngsi-api-key" type="password" autocomplete="off" placeholder="Paste your NanoGPT API key" value="${escapeHtml(apiKey())}"></label>
              <small class="ngsi-help">Saved only in this browser's local storage, not in SillyTavern extension settings.</small>
              <div class="ngsi-row"><label class="ngsi-field">Image model <input class="text_pole ngsi-image-model" value="${escapeHtml(current.imageModel)}" placeholder="e.g. hidream or an image model ID"></label>
              <label class="ngsi-field">Text model for summary/prompt <input class="text_pole ngsi-text-model" value="${escapeHtml(current.textModel)}" placeholder="e.g. minimax/minimax-m2.7"></label></div>
              <div class="ngsi-row"><label class="ngsi-field">Recent messages to summarize <input class="text_pole ngsi-count" type="number" min="2" max="30" value="${Number(current.recentMessages) || 6}"></label>
              <label class="ngsi-field">Image size / resolution <input class="text_pole ngsi-resolution" value="${escapeHtml(current.resolution)}" placeholder="Model-specific, e.g. 1024x1024 or 1k"></label></div>
              <label class="ngsi-field">Optional image quality <input class="text_pole ngsi-quality" value="${escapeHtml(current.imageQuality)}" placeholder="Leave blank unless your model supports it"></label>
              <label class="ngsi-check"><input class="ngsi-appearance" type="checkbox" ${current.includeAppearance ? 'checked' : ''}> Include current character/group appearance and description automatically</label>
              <label class="ngsi-check"><input class="ngsi-portraits" type="checkbox" ${current.includePortraits ? 'checked' : ''}> Send active character/group portrait(s) as visual references</label>
              <small class="ngsi-help">Uses the character portrait assigned in SillyTavern. Portraits are resized in your browser and sent to NanoGPT with the image request.</small>
              <label class="ngsi-field">Extra direction for this image <textarea class="text_pole ngsi-prompt" rows="3" placeholder="Optional framing, mood, style, or specific moment…"></textarea></label>
              <div class="ngsi-divider"></div>
              <b>Named reference images</b>
              <small class="ngsi-help">Add an image with a label such as “Mira — winter outfit”. Choose references to send with each generation.</small>
              <div class="ngsi-row ngsi-ref-add"><input class="text_pole ngsi-ref-name" placeholder="Reference name"><input class="text_pole ngsi-ref-file" type="file" accept="image/png,image/jpeg,image/webp"></div>
              <button class="menu_button ngsi-add-ref">Add reference</button>
              <div class="ngsi-reference-list"></div>
              <button class="menu_button ngsi-generate">Generate image in chat</button>
              <div class="ngsi-status" role="status"></div>
              <small class="ngsi-help">The selected recent messages, character details, instructions, and chosen reference images are sent to NanoGPT. Generation may incur API charges. Avoid sending private chat content unless you are comfortable sharing it with the service.</small>
            </div>
          </div>`;
        host.append(section);

        const $ = selector => section.querySelector(selector);
        $('.ngsi-api-key').addEventListener('change', event => {
            const value = event.target.value.trim();
            if (value) localStorage.setItem(API_KEY_STORAGE, value);
            else localStorage.removeItem(API_KEY_STORAGE);
            setStatus(value ? 'API key saved in this browser.' : 'API key cleared from this browser.');
        });
        const update = (key, value) => { settings()[key] = value; saveSettings(); };
        $('.ngsi-image-model').addEventListener('change', e => update('imageModel', e.target.value.trim()));
        $('.ngsi-text-model').addEventListener('change', e => update('textModel', e.target.value.trim()));
        $('.ngsi-count').addEventListener('change', e => update('recentMessages', Math.max(2, Math.min(30, Number(e.target.value) || 6))));
        $('.ngsi-resolution').addEventListener('change', e => update('resolution', e.target.value.trim()));
        $('.ngsi-quality').addEventListener('change', e => update('imageQuality', e.target.value.trim()));
        $('.ngsi-appearance').addEventListener('change', e => update('includeAppearance', e.target.checked));
        $('.ngsi-portraits').addEventListener('change', e => update('includePortraits', e.target.checked));
        $('.ngsi-add-ref').addEventListener('click', addReference);
        $('.ngsi-generate').addEventListener('click', generateAndInsert);
        refreshReferenceList();
    }

    async function refreshReferenceList() {
        const list = rootElement()?.querySelector('.ngsi-reference-list');
        if (!list) return;
        const [references, selected] = await Promise.all([listReferences(), Promise.resolve(settings().referenceIds || [])]);
        list.replaceChildren();
        if (!references.length) {
            list.innerHTML = '<div class="ngsi-muted">No reference images saved yet.</div>';
            return;
        }
        for (const ref of references) {
            const row = document.createElement('div');
            row.className = 'ngsi-ref-row';
            row.innerHTML = `<label><input type="checkbox" ${selected.includes(ref.id) ? 'checked' : ''}> ${escapeHtml(ref.name)}</label><button class="menu_button ngsi-delete-ref" type="button" aria-label="Delete reference">Remove</button>`;
            row.querySelector('input').addEventListener('change', event => {
                const ids = new Set(settings().referenceIds || []);
                event.target.checked ? ids.add(ref.id) : ids.delete(ref.id);
                settings().referenceIds = [...ids];
                saveSettings();
            });
            row.querySelector('button').addEventListener('click', async () => {
                await deleteReference(ref.id);
                settings().referenceIds = (settings().referenceIds || []).filter(id => id !== ref.id);
                saveSettings();
                refreshReferenceList();
            });
            list.append(row);
        }
    }

    async function addReference() {
        const root = rootElement();
        const nameInput = root.querySelector('.ngsi-ref-name');
        const fileInput = root.querySelector('.ngsi-ref-file');
        const file = fileInput.files?.[0];
        const name = nameInput.value.trim();
        if (!name || !file) return setStatus('Enter a reference name and select a PNG, JPEG, or WebP image.', true);
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setStatus('Only PNG, JPEG, or WebP reference images are supported.', true);
        if (file.size > 12 * 1024 * 1024) return setStatus('Reference image is too large (maximum 12 MB).', true);
        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(reader.error);
                reader.readAsDataURL(file);
            });
            const id = crypto.randomUUID();
            await putReference({ id, name, mime: file.type, dataUrl, updatedAt: Date.now() });
            const ids = new Set(settings().referenceIds || []);
            ids.add(id);
            settings().referenceIds = [...ids];
            saveSettings();
            nameInput.value = '';
            fileInput.value = '';
            setStatus(`Saved “${name}” locally and selected it for generation.`);
            await refreshReferenceList();
        } catch (error) {
            setStatus(`Could not save reference image: ${error.message}`, true);
        }
    }

    function relevantCharacters(ctx) {
        const relevant = [];
        if (ctx.characterId >= 0 && ctx.characters?.[ctx.characterId]) relevant.push(ctx.characters[ctx.characterId]);
        const group = ctx.groupId >= 0 ? ctx.groups?.[ctx.groupId] : null;
        if (group?.members && Array.isArray(ctx.characters)) {
            for (const member of group.members) {
                const found = ctx.characters.find(ch => ch.avatar === member || ch.name === member);
                if (found && !relevant.includes(found)) relevant.push(found);
            }
        }
        return relevant;
    }

    async function loadPortraitReference(character) {
        const avatar = character?.avatar;
        if (!avatar || avatar === 'none' || avatar === 'default') return null;
        const path = `/characters/${encodeURIComponent(avatar)}`;
        const response = await fetch(new URL(path, window.location.origin), { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Avatar request returned HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) throw new Error('SillyTavern did not return an image for this avatar');
        const bitmap = await createImageBitmap(blob);
        const maxEdge = 1024;
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const canvasContext = canvas.getContext('2d');
        canvasContext.fillStyle = '#ffffff';
        canvasContext.fillRect(0, 0, canvas.width, canvas.height);
        canvasContext.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        return {
            name: `${character.name || 'Character'} — SillyTavern portrait`,
            dataUrl: canvas.toDataURL('image/jpeg', 0.9),
        };
    }

    async function loadCharacterPortraits(characters) {
        const results = await Promise.all(characters.map(async character => {
            try {
                return await loadPortraitReference(character);
            } catch (error) {
                console.warn(`[NanoGPT Inline Scene Images] Could not load ${character?.name || 'character'} portrait:`, error);
                return { warning: `${character?.name || 'Character'} portrait could not be loaded` };
            }
        }));
        return {
            references: results.filter(result => result?.dataUrl),
            warnings: results.filter(result => result?.warning).map(result => result.warning),
        };
    }

    function currentCharacterDetails(ctx) {
        if (!settings().includeAppearance) return '';
        const relevant = relevantCharacters(ctx);
        return relevant.map(ch => {
            const data = ch.data || ch;
            const fields = [
                ['Character', ch.name || data.name],
                ['Description / appearance', data.description],
                ['Personality', data.personality],
                ['Scenario', data.scenario],
                ['Creator notes', data.creator_notes],
            ].filter(([, value]) => typeof value === 'string' && value.trim());
            return fields.map(([label, value]) => `${label}: ${value.trim().slice(0, 5000)}`).join('\n');
        }).filter(Boolean).join('\n\n');
    }

    function recentChatText(ctx) {
        const messages = (ctx.chat || []).filter(message => message && typeof message.mes === 'string' && message.mes.trim() && !message.is_system);
        const count = settings().recentMessages;
        return messages.slice(-count).map(message => `${message.name || (message.is_user ? 'User' : 'Character')}: ${message.mes.trim().slice(0, 2500)}`).join('\n\n').slice(-18000);
    }

    async function postJson(url, key, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
        if (!response.ok) {
            const detail = data?.error?.message || data?.message || data?.detail || `HTTP ${response.status}`;
            throw new Error(detail);
        }
        return data;
    }

    async function summarizeAndDescribe(key, ctx, chatText, appearance, extraDirection, refs) {
        const refNames = refs.map(ref => ref.name);
        const system = 'You create faithful visual prompts for a roleplay scene. First infer a concise visual summary from the supplied recent conversation. Preserve who is present, what they are doing, location, mood, and visible continuity. Do not invent details that contradict character descriptions or the chat. Use reference labels as identity/appearance anchors. Return only the finished image prompt (about 80–160 words), not analysis or a separate summary.';
        const request = [
            `Current scene from the last ${settings().recentMessages} chat messages:\n${chatText || '(No usable recent messages.)'}`,
            appearance ? `Character-card appearance and details:\n${appearance}` : 'No character-card appearance details requested.',
            refNames.length ? `Named reference images attached: ${refNames.map(name => `“${name}”`).join(', ')}. Use each label to associate visual identity with the appropriate subject.` : 'No reference images attached.',
            extraDirection ? `Additional user direction:\n${extraDirection}` : '',
            'Make a single coherent still image that reflects the current moment. The prompt must be suitable for image generation and avoid dialogue, plot exposition, or text rendered in the image unless requested.',
        ].filter(Boolean).join('\n\n');
        const result = await postJson(`${API_ROOT}/chat/completions`, key, {
            model: settings().textModel || defaults.textModel,
            messages: [{ role: 'system', content: system }, { role: 'user', content: request }],
            temperature: 0.35,
            max_tokens: 500,
            stream: false,
        });
        const prompt = result.choices?.[0]?.message?.content;
        if (typeof prompt !== 'string' || !prompt.trim()) throw new Error('NanoGPT returned an empty scene prompt. Check the text model setting.');
        return prompt.trim();
    }

    function imageMimeFromDataUrl(dataUrl) {
        const match = /^data:(image\/(?:png|jpeg|webp));base64,/i.exec(dataUrl || '');
        return match?.[1]?.toLowerCase() || 'image/png';
    }

    function extractImages(result) {
        const rows = result.data || result.images || result.output || [];
        const list = Array.isArray(rows) ? rows : [rows];
        return list.map(item => {
            const data = item?.b64_json || item?.b64 || item?.base64 || item?.image_base64;
            if (data) return `data:${item.mime_type || item.mimeType || 'image/png'};base64,${data}`;
            const url = item?.url || item?.image_url || item?.imageUrl;
            if (typeof url === 'string') return url;
            return null;
        }).filter(Boolean);
    }

    async function generateAndInsert() {
        if (busy) return;
        const key = apiKey();
        if (!key) return setStatus('Add your NanoGPT API key above first.', true);
        const ctx = context();
        if (!ctx?.chat) return setStatus('No active SillyTavern chat is available.', true);
        const root = rootElement();
        const extraDirection = root.querySelector('.ngsi-prompt').value.trim();
        setBusy(true);
        try {
            const refs = [];
            const characterSet = relevantCharacters(ctx);
            let portraitWarnings = [];
            if (settings().includePortraits) {
                const portraits = await loadCharacterPortraits(characterSet);
                refs.push(...portraits.references);
                portraitWarnings = portraits.warnings;
            }
            for (const id of settings().referenceIds || []) {
                const ref = await getReference(id);
                if (ref?.dataUrl) refs.push(ref);
            }
            setStatus('Summarizing recent messages and preparing the visual prompt…');
            const chatText = recentChatText(ctx);
            const appearance = currentCharacterDetails(ctx);
            const prompt = await summarizeAndDescribe(key, ctx, chatText, appearance, extraDirection, refs);
            setStatus(`Generating with “${settings().imageModel}”…`);
            const body = {
                model: settings().imageModel || defaults.imageModel,
                prompt,
                n: 1,
                response_format: 'b64_json',
            };
            if (settings().resolution) body.size = settings().resolution;
            if (settings().imageQuality) body.quality = settings().imageQuality;
            if (refs.length) body.imageDataUrls = refs.map(ref => ref.dataUrl);
            const generated = await postJson('https://api.nano-gpt.com/v1/images/generations', key, body);
            const images = extractImages(generated);
            if (!images.length) throw new Error('The image endpoint returned no usable image. Try a different image model.');
            const output = images.map((src, index) => `![Generated scene ${index + 1}](${src})`).join('\n\n');
            const message = {
                name: 'NanoGPT Scene Image',
                is_user: false,
                is_system: false,
                mes: output,
                send_date: new Date().toISOString(),
                extra: { type: 'nanogpt_scene_image', generated_prompt: prompt },
            };
            ctx.chat.push(message);
            const script = await import('/script.js');
            if (typeof script.addOneMessage === 'function') script.addOneMessage(message);
            else if (typeof script.printMessages === 'function') await script.printMessages();
            if (typeof script.saveChatDebounced === 'function') script.saveChatDebounced();
            else if (typeof ctx.saveChat === 'function') await ctx.saveChat();
            root.querySelector('.ngsi-prompt').value = '';
            setStatus(portraitWarnings.length
                ? `Image added to the current chat. Portrait note: ${portraitWarnings.join('; ')}.`
                : 'Image added to the current chat.');
        } catch (error) {
            console.error('[NanoGPT Inline Scene Images]', error);
            setStatus(`Could not generate image: ${error.message}`, true);
        } finally {
            setBusy(false);
        }
    }

    function initialize() {
        if (!context()) return setTimeout(initialize, 500);
        settings();
        makePanel();
        if (!rootElement()) return setTimeout(initialize, 500);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
    context()?.eventSource?.on?.(context()?.event_types?.APP_READY, initialize);
})();
