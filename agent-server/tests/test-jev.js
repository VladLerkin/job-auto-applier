const { initJev, askJev } = require('../src/jev');

async function runTest() {
    // Note: To test this properly, you need a valid TypeSafe API key.
    // E.g., TYPESAFE_API_KEY="your_key" node test-jev.js
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) {
        console.warn("⚠️ TYPESAFE_API_KEY environment variable not set. Skipping real API call.");
        return;
    }

    const client = initJev(apiKey);
    if (!client) {
        console.error("❌ Failed to initialize Jev client.");
        return;
    }

    const cvText = "Senior Software Engineer with 10 years of experience. I live in San Francisco, CA. I am legally authorized to work in the US.";
    const profileText = "I prefer remote work. No sponsorship needed.";
    
    // Mock DOM elements to test both noul (checkbox) and choice (select)
    const binaryFields = [
        {
            id: "checkbox-visa",
            tag: "input",
            type: "checkbox",
            checked: false,
            value: "",
            context: "Will you require visa sponsorship now or in the future?"
        },
        {
            id: "radio-auth-yes",
            tag: "input",
            type: "radio",
            checked: false,
            value: "",
            label: "Yes",
            context: "Do you have a legal right to work in the USA?"
        },
        {
            id: "radio-auth-no",
            tag: "input",
            type: "radio",
            checked: false,
            value: "",
            label: "No",
            context: "Do you have a legal right to work in the USA?"
        },
        {
            id: "select-location",
            tag: "select",
            type: "",
            checked: false,
            value: "",
            context: "Are you willing to relocate?",
            options: ["Yes", "No", "Maybe"]
        }
    ];

    console.log("Mocking DOM extraction. Sending to Jev...");
    const actions = await askJev(client, cvText, profileText, binaryFields);
    
    console.log("✅ Jev returned actions:");
    console.log(JSON.stringify(actions, null, 2));

    // Simple assertions
    if (actions.length > 0) {
        console.log("✅ Test Passed: Jev successfully processed fields.");
    } else {
        console.log("❌ Test Failed or returned 0 actions.");
    }
}

runTest().catch(console.error);
