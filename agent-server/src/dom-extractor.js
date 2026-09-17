/**
 * DOM extraction function to be injected into the browser via page.evaluate().
 * Extracts interactive elements and returns a structured array of field descriptors.
 *
 * @param {string} frameId - A prefix to namespace element IDs per frame.
 * @returns {Array} Array of field descriptor objects.
 */
const extractDOM = (frameId) => {
    const allElements = [];
    
    function traverse(root) {
        // Clear old IDs inside this root (main document or shadow root)
        root.querySelectorAll('[data-arf-id]').forEach(el => el.removeAttribute('data-arf-id'));
        
        const els = root.querySelectorAll('input, select, textarea, button, a, [role="button"], [role="combobox"], [role="listbox"], [role="option"], li, [tabindex="0"], spl-button, oc-button, [aria-label], .select-selected');
        els.forEach(el => allElements.push(el));
        
        const allNodes = root.querySelectorAll('*');
        for (let i = 0; i < allNodes.length; i++) {
            if (allNodes[i].shadowRoot) {
                traverse(allNodes[i].shadowRoot);
            }
        }
    }
    
    traverse(document);

    // Only capture interactive or potentially clickable elements
    const elements = allElements.filter(el => {
        const rect = el.getBoundingClientRect();
        // Basic visibility check
        if (rect.width <= 0 || rect.height <= 0) return false;
        try {
            const style = window.getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') return false;
        } catch(e) {}
        // Filter out LinkedIn navigation noise (skip links, nav items outside modal)
        const text = (el.innerText || el.textContent || '').trim();
        if (el.tagName === 'BUTTON' && text.startsWith('Skip to ')) return false;
        return true;
    });
        
    let idCounter = 1;
    const fields = [];
    
    elements.forEach(el => {
        const idPrefix = frameId ? `${frameId}-` : '';
        const uniqueId = `agent-${idPrefix}${idCounter++}`;
        el.setAttribute('data-arf-id', uniqueId);
        
        let labelText = '';
        if (el.id) {
            try {
                const safeId = el.id.replace(/"/g, '\\"');
                const label = el.getRootNode().querySelector(`label[for="${safeId}"]`);
                if (label) labelText = label.innerText;
            } catch(e) {}
        }
        if (!labelText) {
            const parentLabel = el.closest('label');
            if (parentLabel) labelText = parentLabel.innerText;
        }
        if (!labelText && (el.type === 'radio' || el.type === 'checkbox' || el.getAttribute('role') === 'radio' || el.getAttribute('role') === 'checkbox')) {
            let node = el.parentElement;
            for(let i=0; i<4 && node; i++) {
                let txt = (node.innerText || node.textContent || '').replace(/SVGs not supported by this browser\./g, '').trim();
                if (txt) {
                    labelText = txt.split('\n')[0];
                    break;
                }
                node = node.parentElement;
            }
        }
        if (!labelText) labelText = el.getAttribute('aria-label') || '';
        if (!labelText) labelText = el.name || '';
        
        let optionsList = [];
        if (el.tagName === 'SELECT') {
            optionsList = Array.from(el.options).map(o => o.text.trim()).filter(t => t);
        }

        let textContent = el.innerText || el.textContent || '';
        if (textContent) textContent = textContent.trim().substring(0, 100); // limit length
        
        // Capture role and aria-expanded to help identify combobox/dropdown fields
        let role = el.getAttribute('role') || '';
        const ariaExpanded = el.getAttribute('aria-expanded') || '';

        // React-select support (Greenhouse and others)
        let reactSelectValue = '';
        if (el.tagName === 'INPUT' && (el.classList.contains('select__input') || (el.parentElement && el.parentElement.className && typeof el.parentElement.className === 'string' && el.parentElement.className.includes('select__input-container')) || el.closest('.select__value-container'))) {
            const container = el.closest('.select__value-container') || (el.parentElement && el.parentElement.parentElement);
            if (container) {
                const singleValueDiv = container.querySelector('[class*="-singleValue"], [class*="__single-value"]');
                if (singleValueDiv) {
                    reactSelectValue = singleValueDiv.innerText || singleValueDiv.textContent || '';
                }
            }
        }
        
        // Standard select support
        if (el.tagName === 'SELECT' && el.selectedIndex >= 0) {
            const selectedOption = el.options[el.selectedIndex];
            if (selectedOption && selectedOption.text && !selectedOption.text.toLowerCase().includes('select')) {
                reactSelectValue = selectedOption.text.trim();
            }
        }

        if (reactSelectValue) {
            textContent = reactSelectValue;
        }

        if (el.classList.contains('select-selected')) {
            role = 'combobox';
            let p = el.parentElement;
            if (p) {
                let hiddenSelect = p.querySelector('select');
                if (hiddenSelect) {
                    if (!labelText) labelText = hiddenSelect.name || hiddenSelect.id || '';
                    optionsList = Array.from(hiddenSelect.options).map(o => o.text.trim()).filter(t => t);
                    try {
                        const safeId = hiddenSelect.id ? hiddenSelect.id.replace(/"/g, '\\"') : '';
                        if (safeId) {
                            const label = el.getRootNode().querySelector(`label[for="${safeId}"]`);
                            if (label) labelText = label.innerText;
                        }
                    } catch(e) {}
                }
            }
        }
        
        let isChecked = false;
        if (el.type === 'radio' || el.type === 'checkbox') {
            isChecked = el.checked || false;
        }
        
        if (!isChecked) {
            const ariaPressed = el.getAttribute('aria-pressed');
            const ariaChecked = el.getAttribute('aria-checked');
            const ariaSelected = el.getAttribute('aria-selected');
            const dataState = el.getAttribute('data-state');
            const dataSelected = el.getAttribute('data-selected');
            
            isChecked = ariaPressed === 'true' || 
                        ariaChecked === 'true' || 
                        ariaSelected === 'true' || 
                        dataState === 'checked' || 
                        dataState === 'active' || 
                        dataState === 'on' || 
                        dataSelected === 'true';
        }

        // Provide parent context text for bare Yes/No buttons and radios/checkboxes
        let contextText = null;
        if (el.tagName === 'BUTTON' && (textContent === 'Yes' || textContent === 'No')) {
            let p = el.parentElement;
            if (p) p = p.parentElement; // Go up 2 levels
            if (p) {
                contextText = (p.innerText || '').substring(0, 100).replace(/\n/g, ' ').trim();
            }
        } else if (el.type === 'radio' || el.type === 'checkbox') {
            const fieldset = el.closest('fieldset');
            if (fieldset) {
                const legend = fieldset.querySelector('legend');
                if (legend) contextText = (legend.innerText || legend.textContent || '').substring(0, 150).replace(/\n/g, ' ').trim();
            }
            if (!contextText) {
                let node = el.parentElement;
                for(let i = 0; i < 6 && node; i++) {
                    const heading = node.querySelector('h1, h2, h3, h4, h5, h6, strong, [role="heading"]');
                    if (heading) {
                        contextText = (heading.innerText || heading.textContent || '').substring(0, 150).replace(/\n/g, ' ').trim();
                        break;
                    }
                    if (node.previousElementSibling && ['H3','LABEL','SPAN','STRONG'].includes(node.previousElementSibling.tagName)) {
                        contextText = (node.previousElementSibling.innerText || node.previousElementSibling.textContent || '').substring(0, 150).replace(/\n/g, ' ').trim();
                        break;
                    }
                    node = node.parentElement;
                }
            }
            if (!contextText) {
                let p = el.parentElement;
                if (p && p.parentElement) p = p.parentElement;
                if (p && p.parentElement) p = p.parentElement;
                if (p && p.parentElement) p = p.parentElement;
                if (p) {
                    let lines = (p.innerText || '').replace(/SVGs not supported by this browser\./g, '').split('\n').map(l => l.trim()).filter(l => l);
                    if (lines.length > 0) contextText = lines[0].substring(0, 150);
                }
            }
        }

        let maxLength = el.getAttribute('maxlength');
        if (maxLength) maxLength = parseInt(maxLength, 10);

        fields.push({
            id: uniqueId,
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            placeholder: el.placeholder || '',
            label: labelText.trim().replace(/\n/g, ' '),
            value: el.type === 'radio' || el.type === 'checkbox' ? '' : (el.value || ''),
            checked: isChecked,
            text: textContent,
            context: contextText,
            role: role || '',
            ariaExpanded: ariaExpanded || '',
            maxLength: maxLength || undefined,
            options: optionsList.length > 0 ? optionsList : undefined
        });
    });
    
    return fields;
};

module.exports = { extractDOM };
