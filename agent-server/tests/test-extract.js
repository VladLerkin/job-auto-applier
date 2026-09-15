const { chromium } = require('playwright');

const extractDOM = () => {
    const allElements = [];
    
    function traverse(root) {
        const els = root.querySelectorAll('input, select, textarea, button, [role="button"], [role="combobox"], [role="listbox"], [role="option"], li');
        els.forEach(el => allElements.push(el));
        
        const allNodes = root.querySelectorAll('*');
        for (let i = 0; i < allNodes.length; i++) {
            if (allNodes[i].shadowRoot) {
                traverse(allNodes[i].shadowRoot);
            }
        }
    }
    
    traverse(document);

    const elements = allElements.filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden' && window.getComputedStyle(el).display !== 'none';
    });
        
    let idCounter = 1;
    const fields = [];
    
    elements.forEach(el => {
        const uniqueId = `agent-${idCounter++}`;
        el.setAttribute('data-agent-id', uniqueId);
        
        let labelText = '';
        if (el.id) {
            const label = el.getRootNode().querySelector(`label[for="${el.id}"]`);
            if (label) labelText = label.innerText;
        }
        if (!labelText) labelText = el.getAttribute('aria-label') || '';
        if (!labelText) labelText = el.name || '';
        
        let textContent = el.innerText || el.textContent || '';
        if (textContent) textContent = textContent.trim().substring(0, 100);
        
        fields.push({
            id: uniqueId,
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            name: el.name || '',
            label: labelText.trim().replace(/\n/g, ' '),
            value: el.value || '',
            text: textContent
        });
    });
    
    return fields;
};

(async () => {
    console.log("Connecting to Chrome on port 9222...");
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    const contexts = browser.contexts();
    const pages = contexts[0].pages();
    
    let page = pages.find(p => p.url().includes('smartrecruiters.com'));
    if (!page) {
        console.log("Could not find smartrecruiters page. Available pages:");
        pages.forEach(p => console.log(p.url()));
        process.exit(1);
    }
    
    console.log(`Working on tab: ${page.url()}`);
    
    const domState = [];
    for (const frame of page.frames()) {
        try {
            const frameDom = await frame.evaluate(extractDOM);
            console.log(`Frame ${frame.url()} returned ${frameDom.length} interactive elements`);
            domState.push(...frameDom);
        } catch (e) {
            console.log(`Failed to extract from frame ${frame.url()}:`, e.message);
        }
    }
    
    console.log(`\nTotal elements extracted: ${domState.length}`);
    console.log(JSON.stringify(domState, null, 2).substring(0, 1000) + "\n... (truncated)");
    
    await browser.close();
})();
