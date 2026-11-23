(() => {
  const words = {
    ko: {
      list: '카드 후보', selected: '선택한 카드', loading: '카드를 찾는 중…', choose: '↑↓ 후보 이동 · Tab 카드 선택 · Enter 검색 · Shift+Enter 줄바꿈',
      none: '등록된 카드가 없습니다. 이름을 계속 직접 입력할 수 있습니다.', error: '카드 목록을 불러오지 못했습니다. 질문은 직접 작성할 수 있습니다.',
      namesOnly: '효과 본문 확인 필요', ready: '원문 등록됨', preview: '효과와 출처 보기', remove: '카드 연결 해제',
      community: '참고 원문', communityNote: '공개 카드 페이지에서 수집한 참고 자료입니다. 한국어는 비공식 번역이며 공식 최신 원문·정오표와의 대조가 필요합니다.', collected: '수집일',
      missing: '분석에 사용할 영문 효과 본문이 없습니다. 원래 효과가 없는 카드인지, 자료가 빠진 것인지 확인하기 전에는 해당 카드의 AI 판정을 보류합니다.',
      original: '영문 원문', koreanOfficial: '공식 한국어', koreanOther: '한국어 번역 · 공식 여부 확인 필요',
      koreanAI: 'RiftAssist AI 번역 · 비공식', koreanMock: '개발용 모의 번역 · 공식 번역 아님', translationPending: '한국어 번역은 관리자 검토 대기 중입니다. 영문 원문을 확인하세요.', translationSource: '번역 출처·검토',
      errata: '정오표', source: '원문 출처', version: '자료 버전', updated: '갱신일',
      energy: '에너지', power: '힘', might: '위력', selectedNotice: '카드를 선택했습니다.',
      limit: '한 질문에는 서로 다른 카드 8장까지 연결할 수 있습니다.', tooLong: '질문은 10,000자까지 작성할 수 있습니다.', selectionRetry: '카드 선택을 완료하지 못했습니다. 후보를 다시 선택해 주세요.',
      checking: '카드 목록을 확인하고 있습니다.', catalog: () => '카드명 2글자부터 · 한 글자 챔피언도 검색',
      noneCatalog: '카드 자료 준비 중입니다. 질문에 정확한 카드명과 효과를 적어 주세요.',
      restrictedCatalog: '카드 이용 권한 확인 중으로 카드 검색·이미지·카드에 의존하는 AI 판정을 제한합니다. 규칙·저지 사례는 계속 검색할 수 있습니다.',
      mockCard: '개발용 합성 카드 · 공식 카드 아님', previewCard: '미출시 프리뷰',
      citation: '답변에서 인용', unavailable: '모델 사용 준비 전',
    },
    en: {
      list: 'Card suggestions', selected: 'Selected cards', loading: 'Finding cards…', choose: '↑↓ navigate · Tab select card · Enter search · Shift+Enter newline',
      none: 'No registered card matches. You can continue typing its name.', error: 'Card search is unavailable. You can still write your question.',
      namesOnly: 'Effect text needs confirmation', ready: 'Original available', preview: 'Show text and source', remove: 'Unlink card',
      community: 'Reference text', communityNote: 'Reference data collected from a public card page. Korean text is an unofficial translation; compare with current official text and errata.', collected: 'Collected',
      missing: 'English effect text is unavailable. Analysis is paused until we confirm whether this card has no effect or the source text is missing.',
      original: 'English original', koreanOfficial: 'Official Korean', koreanOther: 'Korean translation · official status unconfirmed',
      koreanAI: 'RiftAssist AI translation · unofficial', koreanMock: 'Mock translation · not official', translationPending: 'Korean translation awaits operator review. Check the English original.', translationSource: 'Translation source and review',
      errata: 'Errata', source: 'Original source', version: 'Data version', updated: 'Updated',
      energy: 'Energy', power: 'Power', might: 'Might', selectedNotice: 'Card selected.',
      limit: 'Select at most 8 different cards per question.', tooLong: 'Questions must be 10,000 characters or fewer.', selectionRetry: 'Card selection did not finish. Select the suggestion again.',
      checking: 'Checking card catalog.', catalog: () => '2+ characters, or a single-character Korean champion name.',
      noneCatalog: 'Card data is being prepared. Include the exact card name and effect in your question.',
      restrictedCatalog: 'Card search, images and card-dependent AI answers are restricted while usage rights are reviewed. Rule and judge-case search remains available.',
      mockCard: 'Synthetic development card · not an official card', previewCard: 'Preview · unreleased',
      citation: 'Cited in answer', unavailable: 'Not ready for model use',
    },
  };
  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value != null) node.textContent = value;
    return node;
  }

  class CardComposer {
    constructor(textarea, language = 'ko') {
      this.textarea = textarea;
      this.language = language;
      this.mentions = [];
      this.previousValue = textarea.value;
      this.results = [];
      this.active = -1;
      this.requestNumber = 0;
      this.frozen = false;
      this.composing = false;
      this.catalog = null;
      this.failedImages = new Set();
      this.rememberedIds = [];
      try { const saved=JSON.parse(sessionStorage.getItem('riftassi-card-ids')||'[]'); if(Array.isArray(saved))this.rememberedIds=saved.filter(id=>typeof id==='string'&&/^[a-zA-Z0-9:._-]{1,120}$/.test(id)).slice(-64); } catch { /* optional per-tab memory */ }
      this.excludedIds = new Set();
      this.resolveNumber = 0;
      this.mirror = document.querySelector('#question-highlights');
      this.popup = document.querySelector('#card-suggestions');
      this.options = document.querySelector('#card-options');
      this.cardsNode = document.querySelector('#selected-cards');
      this.note = document.querySelector('#card-catalog-note');
      textarea.setAttribute('aria-controls', 'card-options');
      textarea.setAttribute('aria-autocomplete', 'list');
      textarea.setAttribute('aria-expanded', 'false');
      textarea.addEventListener('input', (event) => this.onInput(event));
      textarea.addEventListener('scroll', () => { this.mirror.scrollTop = textarea.scrollTop; this.mirror.scrollLeft = textarea.scrollLeft; });
      textarea.addEventListener('click', () => this.schedule());
      textarea.addEventListener('keyup', (event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) this.schedule(); });
      // Search during Korean IME composition too; Enter still belongs to the IME.
      textarea.addEventListener('compositionstart', () => {
        this.cancelChoice();
        this.composing = true;
        this.imeEnterUntil = 0;
        this.composition = {
          prefix: textarea.value.slice(0, textarea.selectionStart),
          suffix: textarea.value.slice(textarea.selectionEnd),
          changedAt: performance.now(),
        };
      });
      textarea.addEventListener('compositionend', (event) => {
        this.composing = false;
        this.imeEnterUntil = performance.now() + 30;
        if (this.composition) {
          this.composition.data = event.data;
          this.composition.endedAt = this.composition.changedAt = performance.now();
        }
        this.trackEdits();
        this.recordCommittedInput();
        if (this.selectionTask) return;
        if (!this.pointerSelecting && !this.hasCompositionCandidate()) this.schedule();
        this.scheduleResolution();
      });
      textarea.addEventListener('keydown', (event) => this.onKeyDown(event), { capture:true });
      textarea.addEventListener('keyup', (event) => { if (event.key === 'Enter') this.imeEnterUntil = 0; });
      document.addEventListener('keydown', (event) => {
        if (event.code === 'Tab' && !event.shiftKey && this.choice?.composition &&
            this.composing && document.activeElement === document.body) event.preventDefault();
      }, { capture: true });
      document.addEventListener('pointerdown', (event) => {
        if (!this.popup.contains(event.target) && event.target !== textarea) {
          this.cancelChoice();
          this.hideSuggestions();
        }
      });
      document.addEventListener('pointerup', () => { setTimeout(() => { this.pointerSelecting = false; }, 0); });
      document.addEventListener('pointercancel', () => { this.pointerSelecting = false; });
      textarea.addEventListener('blur', () => {
        setTimeout(() => { if (!this.pointerSelecting && !this.popup.contains(document.activeElement) && document.activeElement !== textarea) this.hideSuggestions(); }, 150);
      });
      this.setLanguage(language);
      this.loadCatalog();
    }

    t(key) { return words[this.language][key]; }
    name(card) { return this.language === 'en' ? card.nameEn || card.nameKo : card.nameKo || card.nameEn; }
    statusLabel(card) {
      const label = this.t(card.authority === 'mock-source' ? 'mockCard' : !card.modelReady ? 'namesOnly' : card.authority === 'community-source' ? 'community' : 'ready');
      return card.status === 'preview-unreleased' ? `${label} · ${this.t('previewCard')}` : label;
    }
    announce(message) { document.querySelector('#card-announcement').textContent = message; }

    async loadCatalog() {
      try {
        const response = await fetch('/api/cards/search?browse=1');
        if (!response.ok) throw new Error('Card catalog unavailable');
        this.catalog = await response.json();
        this.updateCatalogNote();
        if(document.activeElement===this.textarea)this.schedule();
      } catch { this.catalogFailed = true; this.updateCatalogNote(); }
    }

    updateCatalogNote() {
      // Keep actionable errors visible; routine usage and collection details belong outside the form.
      const limited = this.catalog?.access?.mode === 'restricted' || (this.catalog?.access?.restrictedTotal > 0 && !this.catalog.total);
      const message = this.catalogFailed ? this.t('error') : limited ? this.t('restrictedCatalog') : this.catalog && !this.catalog.total ? this.t('noneCatalog') : this.catalog ? this.t('catalog')() : '';
      this.note.textContent = message;
      this.note.hidden = !message;
    }

    setLanguage(language) {
      this.language = language === 'en' ? 'en' : 'ko';
      this.hideSuggestions();
      this.options.setAttribute('aria-label', this.t('list'));
      this.cardsNode.setAttribute('aria-label', this.t('selected'));
      this.updateCatalogNote();
      this.renderSelected();
    }

    trackEdits() {
      const before = this.previousValue;
      const after = this.textarea.value;
      if (before === after) return;
      let start = 0;
      while (start < before.length && start < after.length && before[start] === after[start]) start += 1;
      let oldEnd = before.length;
      let newEnd = after.length;
      while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd -= 1; newEnd -= 1; }
      const shift = newEnd - oldEnd;
      this.mentions = this.mentions.flatMap((mention) => {
        if (mention.end <= start) return [mention];
        if (mention.start >= oldEnd) return [{ ...mention, start: mention.start + shift, end: mention.end + shift }];
        return [];
      }).filter((mention) => after.slice(mention.start, mention.end) === mention.label);
      this.previousValue = after;
      this.selectionNumber = (this.selectionNumber || 0) + 1;
    }

    renderHighlights() {
      const fragment = document.createDocumentFragment();
      let position = 0;
      for (const mention of [...this.mentions].sort((a, b) => a.start - b.start)) {
        fragment.append(document.createTextNode(this.textarea.value.slice(position, mention.start)));
        fragment.append(element('mark', 'card-mention', mention.label));
        position = mention.end;
      }
      fragment.append(document.createTextNode(`${this.textarea.value.slice(position)}\n`));
      this.mirror.replaceChildren(fragment);
      this.mirror.scrollTop = this.textarea.scrollTop;
    }

    getCardIds() {
      this.trackEdits();
      return [...new Set(this.mentions.map((mention) => mention.card.id))];
    }

    getRememberedCardIds() { return [...this.rememberedIds]; }
    getExcludedCardIds() { return [...this.excludedIds]; }
    remember(card) {
      this.rememberedIds=[...this.rememberedIds.filter(id=>id!==card.id),card.id].slice(-64);
      try { sessionStorage.setItem('riftassi-card-ids',JSON.stringify(this.rememberedIds)); } catch { /* memory still works on this page */ }
    }
    scheduleResolution() {
      clearTimeout(this.resolveTimer);this.resolveNumber++;this.resolveController?.abort();
      if(this.frozen||this.composing||(this.textarea.value.trim().length<2&&!this.catalog?.singleCharacterNames?.includes(this.textarea.value.trim())))return;
      this.resolveTimer=setTimeout(()=>this.resolveNames(),260);
    }
    async resolveNames() {
      if(this.frozen||this.composing)return;
      const value=this.textarea.value,number=++this.resolveNumber;
      this.resolveController?.abort();this.resolveController=new AbortController();
      try {
        const response=await fetch('/api/cards/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:value,cardIds:this.getCardIds(),rememberedCardIds:this.rememberedIds,excludedCardIds:[...this.excludedIds]}),signal:this.resolveController.signal});
        if(!response.ok)return;
        const data=await response.json();
        if(number!==this.resolveNumber||value!==this.textarea.value||this.frozen||this.composing)return;
        const byId=new Map((data.cards||[]).map(card=>[card.id,card]));
        const mentions=(data.references||[]).filter(ref=>byId.has(ref.cardId)&&value.slice(ref.start,ref.end)===ref.label).map(ref=>({...ref,card:byId.get(ref.cardId)}));
        // Automatic highlights must not dismiss the user's open candidate list.
        this.mentions=mentions;this.previousValue=value;
        for(const card of byId.values())this.remember(card);
        this.renderHighlights();this.renderSelected();
      } catch { /* final submission repeats lookup against the current server catalog */ }
    }

    schedule() {
      clearTimeout(this.timer);
      if (this.frozen) return;
      this.hideSuggestions();
      this.timer = setTimeout(() => this.search(), 160);
    }

    async search() {
      if (this.frozen || document.activeElement !== this.textarea) return;
      const caret = this.textarea.selectionStart;
      if (caret !== this.textarea.selectionEnd || this.mentions.some((mention) => caret > mention.start && caret <= mention.end)) return;
      const query = this.textarea.value.slice(Math.max(0, caret - 100), caret).split('\n').pop();
      const lastWord = query.match(/[\p{L}\p{N}]+$/u)?.[0] || '';
      if (!lastWord || (query.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').length < 2 && !this.catalog?.singleCharacterNames?.includes(lastWord.normalize('NFKC')))) return;
      const number = ++this.requestNumber;
      this.searchController?.abort();
      this.searchController = new AbortController();
      const snapshot = { value: this.textarea.value, caret, query };
      try {
        const params = new URLSearchParams({ q: query, language: this.language });
        const response = await fetch(`/api/cards/search?${params}`, { signal: this.searchController.signal });
        if (!response.ok) throw new Error('Card search unavailable');
        const data = await response.json();
        if (number !== this.requestNumber || snapshot.value !== this.textarea.value || snapshot.caret !== this.textarea.selectionStart || this.frozen || document.activeElement !== this.textarea) return;
        this.catalog = data;
        this.catalogFailed = false;
        this.updateCatalogNote();
        this.snapshot = snapshot;
        this.results = data.results || [];
        if (!this.results.length) return;
        this.showResults();
      } catch (error) {
        if (error.name === 'AbortError' || number !== this.requestNumber) return;
        this.catalogFailed = true;
        this.updateCatalogNote();
      }
    }

    showResults() {
      this.options.replaceChildren();
      this.active = this.results.length ? 0 : -1;
      document.querySelector('#card-suggestion-status').textContent = this.results.length ? this.t('choose') : this.t('none');
      this.results.forEach((card, index) => {
        const option = element('div', 'card-option');
        option.id = `card-option-${index}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(index === this.active));
        const description = element('div', 'card-option-copy');
        description.append(element('strong', '', this.name(card)));
        const otherName = this.language === 'en' ? card.nameKo : card.nameEn;
        description.append(element('span', '', [otherName, card.subtitle, card.code || card.set, card.type].filter(Boolean).join(' · ')));
        description.append(element('span', 'card-data-status', this.statusLabel(card)));
        option.append(this.thumbnail(card), description);
        option.addEventListener('pointerdown', (event) => {
          this.pointerSelecting = true;
          if (event.pointerType === 'mouse') event.preventDefault();
        });
        // A real pointer movement changes the Tab target; merely scrolling under a parked mouse does not.
        option.addEventListener('pointermove', (event) => { if (event.pointerType !== 'touch' && (event.clientX !== this.pointerX || event.clientY !== this.pointerY)) { this.pointerX = event.clientX; this.pointerY = event.clientY; this.setActive(index); } });
        option.addEventListener('click', () => this.selectResult(index));
        this.options.append(option);
      });
      this.popup.hidden = false;
      this.textarea.setAttribute('aria-expanded', 'true');
      if(this.active>=0)this.textarea.setAttribute('aria-activedescendant',`card-option-${this.active}`);
    }

    hideSuggestions() {
      clearTimeout(this.timer);
      this.requestNumber += 1;
      this.searchController?.abort();
      this.popup.hidden = true;
      this.active = -1;
      this.textarea.setAttribute('aria-expanded', 'false');
      this.textarea.removeAttribute('aria-activedescendant');
    }

    setActive(index) {
      this.active = index;
      [...this.options.children].forEach((option, position) => option.setAttribute('aria-selected', String(position === index)));
      this.textarea.setAttribute('aria-activedescendant', 'card-option-' + index);
    }

    submitQuestion() {
      const form = this.textarea.form;
      const button = form?.querySelector('#submit-button');
      if (this.frozen || this.composing || !this.textarea.value.trim() || !button || button.disabled) return;
      this.hideSuggestions();
      form.requestSubmit(button);
    }

    onKeyDown(event) {
      if (event.key === 'Enter') {
        // Shift+Enter always remains a newline, even with a highlighted candidate.
        if (event.shiftKey) return;
        // Some browsers end composition immediately before its Enter keydown.
        // Keyup ends this same-gesture guard; a later physical Enter can submit.
        if (event.isComposing || this.composing || event.keyCode === 229) return;
        if (performance.now() < (this.imeEnterUntil || 0)) { event.preventDefault(); return; }
        event.preventDefault();
        if (event.repeat || this.frozen || event.altKey || event.ctrlKey || event.metaKey) return;
        if (this.selectionTask) {
          if (!this.submitAfterSelection) {
            this.submitAfterSelection = true;
            this.selectionTask.then(selected => { if (selected) this.submitQuestion(); }).finally(() => { this.submitAfterSelection = false; });
          }
        } else this.submitQuestion();
        return;
      }
      if (this.frozen) return;
      if (event.key === 'Escape') { this.cancelChoice(); if (!this.popup.hidden) event.preventDefault(); this.hideSuggestions(); return; }
      if (event.key === 'Tab' || event.code === 'Tab') {
        if (!event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && (this.selectionTask || (!this.popup.hidden && this.results.length))) {
          event.preventDefault();
          event.stopPropagation();
          if (!this.selectionTask) this.selectResult(this.active >= 0 ? this.active : 0);
        } else {
          this.cancelChoice();
          this.hideSuggestions();
        }
        return;
      }
      if (this.popup.hidden || !this.results.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.setActive(this.active < 0 ? (event.key === 'ArrowDown' ? 0 : this.results.length - 1)
          : (this.active + (event.key === 'ArrowDown' ? 1 : -1) + this.results.length) % this.results.length);
        this.options.children[this.active]?.scrollIntoView({ block: 'nearest' });
      }
    }

    compositionRange(snapshot, composition, value) {
      const start = snapshot.caret - snapshot.matchedLength;
      const { prefix, suffix } = composition;
      // Only the original composition slot may change. Its suffix anchors the
      // right edge even when the final Windows input moves the caret.
      if (prefix.length < start || prefix.length > snapshot.caret ||
          !snapshot.value.startsWith(prefix) || snapshot.value.slice(snapshot.caret) !== suffix ||
          !value.startsWith(prefix) || !value.endsWith(suffix) ||
          value.length < prefix.length + suffix.length) return null;
      return { start, end: value.length - suffix.length };
    }

    onInput(event) {
      const composition = this.composition;
      const imeInput = composition && (event.isComposing ||
        event.inputType === 'insertCompositionText' || event.inputType === 'insertFromComposition' ||
        (event.inputType === 'insertText' && (this.composing ||
          (!composition.finalInput && event.data != null && event.data === composition.data &&
           performance.now() - composition.endedAt < 100))));
      this.trackEdits();
      if (imeInput) {
        composition.changedAt = performance.now();
        if (!this.composing) composition.finalInput = true;
        this.recordCommittedInput();
      } else {
        this.composition = null;
        this.cancelChoice();
      }
      this.renderHighlights();
      this.renderSelected();
      const keepCandidate = imeInput && !this.composing && this.hasCompositionCandidate();
      if (!this.pointerSelecting && !this.selectionTask && !keepCandidate) this.schedule();
      if (!this.selectionTask) this.scheduleResolution();
    }

    hasCompositionCandidate() {
      return !this.popup.hidden && this.composition && this.results.some(result => this.compositionRange(
        { ...this.snapshot, matchedLength: result.matchedText.length }, this.composition, this.textarea.value));
    }

    recordCommittedInput() {
      const choice = this.choice;
      if (!choice?.composition || choice.composition !== this.composition || choice.controller.signal.aborted) return;
      choice.value = this.textarea.value;
      choice.revision = this.selectionNumber;
    }

    cancelChoice() {
      this.choice?.controller.abort();
    }

    selectionFailed(code) {
      const status = document.querySelector('#card-announcement');
      status.dataset.selectionError = code;
      this.announce(this.t(code === 'detail-unavailable' ? 'error' : 'selectionRetry'));
      return false;
    }

    selectResult(index) {
      if (this.selectionTask) return this.selectionTask;
      const result = this.results[index], snapshot = this.snapshot;
      if (!result || !snapshot || this.frozen) return Promise.resolve(false);
      const matchedLength = result.matchedText.length;
      const start = snapshot.caret - matchedLength;
      if (!matchedLength || start < 0 || snapshot.value.slice(start, snapshot.caret) !== result.matchedText) {
        return Promise.resolve(this.selectionFailed('invalid-match'));
      }
      const activeComposition = this.composition;
      const composition = activeComposition && this.compositionRange(
        { ...snapshot, matchedLength }, activeComposition, this.textarea.value) ? activeComposition : null;
      if (!composition && (this.composing || snapshot.value !== this.textarea.value || snapshot.caret !== this.textarea.selectionStart)) {
        this.schedule();
        return Promise.resolve(this.selectionFailed('candidate-changed'));
      }

      delete document.querySelector('#card-announcement').dataset.selectionError;
      this.trackEdits();
      const choice = {
        id: result.id, snapshot: { ...snapshot, matchedLength }, composition,
        value: this.textarea.value, revision: this.selectionNumber,
        controller: new AbortController(),
      };
      this.choice = choice;
      this.hideSuggestions();
      clearTimeout(this.resolveTimer);
      this.resolveNumber++;
      this.resolveController?.abort();
      this.selectionTask = Promise.resolve().then(() => this.commitResult(choice)).finally(() => {
        this.choice = null;
        this.selectionTask = null;
        this.schedule();
        this.scheduleResolution();
      });
      return this.selectionTask;
    }

    async waitForComposition(choice) {
      const composition = choice.composition;
      const deadline = performance.now() + 750;
      // Chromium and Windows text services may deliver terminal input on either
      // side of compositionend. Keep the slot open until both have had time to settle.
      while (!choice.controller.signal.aborted && performance.now() < deadline) {
        if (!this.composing && performance.now() - composition.changedAt >= 64) return true;
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      return false;
    }

    async commitResult(choice) {
      const { id, snapshot, composition, controller } = choice;
      const refocus = composition && this.composing && document.activeElement === this.textarea;
      // Start detail lookup independently. Its response never authorizes a write
      // until the native input and the anchored replacement range are validated.
      const detail = fetch('/api/cards/' + encodeURIComponent(id), { signal: controller.signal })
        .then(response => response.ok ? response.json() : null)
        .then(data => data?.card?.id === id ? data.card : null)
        .catch(() => null);
      try {
        if (refocus) this.textarea.blur();
        if (composition && !await this.waitForComposition(choice)) {
          return this.selectionFailed(controller.signal.aborted ? 'input-changed' : 'ime-timeout');
        }
        if (refocus && document.activeElement === document.body) this.textarea.focus();
        const card = await detail;
        if (composition && !await this.waitForComposition(choice)) {
          return this.selectionFailed(controller.signal.aborted ? 'input-changed' : 'ime-timeout');
        }
        if (controller.signal.aborted || this.frozen || this.composing ||
            choice.revision !== this.selectionNumber || choice.value !== this.textarea.value) {
          return this.selectionFailed('input-changed');
        }
        if (!card) return this.selectionFailed('detail-unavailable');
        const value = this.textarea.value;
        const range = composition ? this.compositionRange(snapshot, composition, value)
          : snapshot.caret === this.textarea.selectionStart && snapshot.caret === this.textarea.selectionEnd
            ? { start: snapshot.caret - snapshot.matchedLength, end: snapshot.caret } : null;
        if (!range) return this.selectionFailed('range-changed');
        const ids = this.getCardIds();
        if (!ids.includes(id) && ids.length >= 8) { this.announce(this.t('limit')); return false; }
        const label = this.name(card);
        const nextCharacter = value[range.end];
        const insertion = label + (!nextCharacter || /[\p{L}\p{N}]/u.test(nextCharacter) ? ' ' : '');
        if (value.length - (range.end - range.start) + insertion.length > this.textarea.maxLength) {
          this.announce(this.t('tooLong'));
          return false;
        }
        this.imeEnterUntil = 0;
        this.composition = null;
        this.textarea.setRangeText(insertion, range.start, range.end, 'end');
        this.trackEdits();
        this.mentions = this.mentions.filter(mention => mention.end <= range.start || mention.start >= range.start + label.length);
        this.mentions.push({ start: range.start, end: range.start + label.length, label, card });
        this.mentions.sort((a,b) => a.start - b.start);
        this.excludedIds.delete(id);
        this.remember(card);
        this.textarea.focus();
        this.choice = null;
        this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
        this.announce(label + ': ' + this.t('selectedNotice'));
        return true;
      } finally {
        controller.abort();
        if (refocus && document.activeElement === document.body) this.textarea.focus();
      }
    }

    thumbnail(card) {
      const name=this.name(card);
      const placeholder = element('span', 'card-thumbnail-placeholder');
      placeholder.setAttribute('role','img');placeholder.setAttribute('aria-label',name);placeholder.title=name;
      const short=name.split(/\s*[,，:]\s*|\s+[-–—]\s+/u)[0];
      placeholder.append(element('strong','',Array.from(short).slice(0,2).join('')),element('small','',String(card.code||card.set||card.type||'').slice(0,8)));
      if (!card.imageUrl || !/^https:\/\//iu.test(card.imageUrl) || this.failedImages.has(card.imageUrl)) return placeholder;
      const image = element('img', 'card-thumbnail');
      image.alt = name;
      image.decoding = 'async';
      image.loading = 'lazy';
      image.referrerPolicy = 'no-referrer';
      image.src = card.imageUrl;
      image.addEventListener('error', () => { this.failedImages.add(card.imageUrl); image.replaceWith(placeholder); }, { once: true });
      return image;
    }

    cardPanel(card, removable, cited) {
      const panel = element('article', `selected-card${cited ? ' cited-card' : ''}`);
      panel.dataset.cardId = card.id;
      const header = element('div', 'selected-card-heading');
      const identity = element('div', 'selected-card-identity');
      identity.append(element('strong', '', this.name(card)), element('span', 'card-data-status', [card.code, card.subtitle, this.statusLabel(card), cited ? this.t('citation') : ''].filter(Boolean).join(' · ')));
      header.append(this.thumbnail(card), identity);
      if (removable) {
        const remove = element('button', 'unlink-card', '×');
        remove.type = 'button';
        remove.disabled = this.frozen;
        remove.setAttribute('aria-label', `${this.t('remove')}: ${this.name(card)}`);
        remove.addEventListener('click', () => {
          this.excludedIds.add(card.id);this.resolveNumber++;this.resolveController?.abort();
          this.mentions = this.mentions.filter((mention) => mention.card.id !== card.id);
          this.renderHighlights(); this.renderSelected(); this.textarea.focus();
        });
        header.append(remove);
      }
      panel.append(header);
      const details = element('details', 'card-detail');
      details.append(element('summary', '', this.t('preview')));
      if(card.imageUrl){const art=this.thumbnail(card);art.classList.add('card-detail-art');details.append(art);}
      if (!card.modelReady) details.append(element('p', 'card-pending', this.t('missing')));
      // Source provenance remains in the response and operations record.
      const stats = ['energy', 'power', 'might'].filter((key) => card.stats?.[key] != null).map((key) => `${this.t(key)} ${card.stats[key]}`);
      if (stats.length) details.append(element('p', 'card-stats', stats.join(' · ')));
      const koreanLabel = card.translationStatus === 'official' ? 'koreanOfficial' : card.translationStatus === 'unofficial-ai-reviewed' ? 'koreanAI' : card.translationStatus === 'mock' ? 'koreanMock' : 'koreanOther';
      for (const [key, label] of [['textEn', this.t('original')], ['textKo', this.t(koreanLabel)], ['errata', this.t('errata')]]) {
        if (card[key]) details.append(element('strong', 'quote-label', label), element('p', 'card-original', card[key]));
      }
      if (card.translationStatus === 'translation-review-pending') details.append(element('p', 'card-pending', this.t('translationPending')));
      if (card.translationRecord) {
        const record = card.translationRecord;
        details.append(element('p', 'card-source-meta', `${this.t('translationSource')}: ${[record.provider, record.model, record.generatedAt || record.createdAt, record.sourceVersion, record.review.reference].filter(Boolean).join(' · ')}`));
      }
      if (card.authority !== 'community-source' && card.source?.label) details.append(element('p', 'card-source-meta', card.source.label));
      if (card.authority !== 'community-source' && card.source?.version) details.append(element('p', 'card-source-meta', `${this.t('version')}: ${card.source.version}`));
      if (card.source?.updatedAt) details.append(element('p', 'card-source-meta', `${this.t('updated')}: ${card.source.updatedAt}`));
      if (card.source?.fetchedAt) details.append(element('p', 'card-source-meta', `${this.t('collected')}: ${card.source.fetchedAt}`));
      if (card.authority !== 'community-source' && card.source?.url && /^https:\/\//iu.test(card.source.url)) {
        const link = element('a', 'source-link', this.t('source'));
        link.href = card.source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link);
      }
      if (card.textVerified && !card.modelReady) details.append(element('p', 'card-pending', this.t('unavailable')));
      panel.append(details);
      return panel;
    }

    renderSelected() {
      const opened = new Set([...this.cardsNode.querySelectorAll('.selected-card')]
        .filter(panel => panel.querySelector('details')?.open).map(panel => panel.dataset.cardId));
      this.cardsNode.replaceChildren();
      const unique = new Map(this.mentions.map((mention) => [mention.card.id, mention.card]));
      for (const card of unique.values()) {
        const panel = this.cardPanel(card, true, false); panel.querySelector('details').open = opened.has(card.id);
        this.cardsNode.append(panel);
      }
    }

    renderAnswer(container, cards, citedIds = []) {
      container.replaceChildren();
      for (const card of cards || []) container.append(this.cardPanel(card, false, citedIds.includes(card.id)));
    }

    freeze(value) {
      this.frozen = value;
      this.textarea.readOnly = value;
      if (value) { this.cancelChoice(); this.hideSuggestions(); this.selectionNumber = (this.selectionNumber || 0) + 1; clearTimeout(this.resolveTimer);this.resolveNumber++;this.resolveController?.abort(); }
      this.renderSelected();
    }

    reset() {
      this.cancelChoice();
      this.hideSuggestions();
      clearTimeout(this.resolveTimer);this.resolveNumber++;this.resolveController?.abort();this.excludedIds.clear();
      this.selectionNumber = (this.selectionNumber || 0) + 1;
      this.mentions = [];
      this.previousValue = this.textarea.value;
      this.renderHighlights(); this.renderSelected();
    }
  }
  window.CardComposer = CardComposer;
})();
