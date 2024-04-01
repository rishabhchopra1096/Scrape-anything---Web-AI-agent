// I want the code from web_agent.js to be executed in the browser

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const OpenAI = require('openai');
const readline = require('readline');
const fs = require('fs');
require('dotenv/config');

puppeteer.use(StealthPlugin());

const openai = new OpenAI();
const timeout = 5000;

async function image_to_base64(image_file) {
    // We need to convert images to base64 images so that we can pass it down to gpt-4v
    return await new Promise((resolve, reject) => {
        fs.readFile(image_file, (err, data) => {
            if (err) {
                console.error('Error reading the file:', err);
                reject();
                return;
            }

            const base64Data = data.toString('base64');
            const dataURI = `data:image/jpeg;base64,${base64Data}`;
            resolve(dataURI);
        });
    });
}

// async function input( text ) {
//     // This will create a simple command line interface to interact with the 
//     // web agent. 
//     let the_prompt;
//     const rl = readline.createInterface({
//       input: process.stdin,
//       output: process.stdout
//     });

//     await (async () => {
//         return new Promise( resolve => {
//             rl.question( text, (prompt) => {
//                 the_prompt = prompt;
//                 rl.close();
//                 resolve();
//             } );
//         } );
//     })();

//     return the_prompt;
// }

async function sleep( milliseconds ) {
    // A sleep function for it to wait for the timer so that the page can be fully loaded
    // when it's browsing the website. 
    return await new Promise((r, _) => {
        setTimeout( () => {
            r();
        }, milliseconds );
    });
}

async function highlight_links( page ) {
    // Inputs: The Page
    // We want to create a box around the elements that can be 
    // interacted with. 
    // Output: 
    // 

    // Remove already existing highlighted boxes
    await page.evaluate(() => {
        document.querySelectorAll('[gpt-link-text]').forEach(e => {
            e.removeAttribute("gpt-link-text");
        });
    });

    // Get all the elements that we can interact with 
    // links, buttons, textinput, etc. 
    const elements = await page.$$(
        "a, button, input, textarea, [role=button], [role=treeitem]"
    );

    // For each of the elements that are interactable, we will check: 
    // 1. The element exists. 
    // 2. The element is visible. 
    // 3. The element is in the current viewport. 
    // 4. Check if it's ancesor element is also visible. 

    elements.forEach( async e => {
        await page.evaluate(e => {
            function isElementVisible(el) {
                // If the element doesn't exist, return false. 
                if (!el) return false; 

                // To check if that element is visible, we will check if it's width, 
                // height, opacity, display and visibility -- indicates that they are
                // visible. 
                function isStyleVisible(el) {
                    const style = window.getComputedStyle(el);
                    return style.width !== '0' &&
                           style.height !== '0' &&
                           style.opacity !== '0' &&
                           style.display !== 'none' &&
                           style.visibility !== 'hidden';
                }

                // To check if the current element is in the current viewport. 
                function isElementInViewport(el) {
                    const rect = el.getBoundingClientRect();
                    return (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                    );
                }

                // Check if the element is visible style-wise
                if (!isStyleVisible(el)) {
                    return false;
                }

                // Traverse up the DOM and check if any ancestor element is hidden
                let parent = el;
                while (parent) {
                    if (!isStyleVisible(parent)) {
                    return false;
                    }
                    parent = parent.parentElement;
                }

                // Finally, check if the element is within the viewport
                return isElementInViewport(el);
            }

            // Create a box around the element 
            e.style.border = "1px solid red";

            const position = e.getBoundingClientRect();

            // If the element is visible, it'll clean up the link text 
            // and set a special attribute to the element so that later we can use
            // this as an identifier of what pupeteer should interact with. 
            if( position.width > 5 && position.height > 5 && isElementVisible(e) ) {
                const link_text = e.textContent.replace(/[^a-zA-Z0-9 ]/g, '');
                e.setAttribute( "gpt-link-text", link_text );
            }
        }, e);
    } );
}


async function waitForEvent(page, event) {
    // We want the agent to only execute after a certain event: like page load. 
    return page.evaluate(event => {
        return new Promise((r, _) => {
            document.addEventListener(event, function(e) {
                r();
            });
        });
    }, event)
}

(async () => {
    console.log( "###########################################" );
    console.log( "# GPT4V-Browsing by Unconventional Coding #" );
    console.log( "###########################################\n" );

    const browser = await puppeteer.launch( {
        headless: "false",
        executablePath: '/Applications/Google\ Chrome\ Canary.app/Contents/MacOS/Google\ Chrome\ Canary',
        userDataDir: '/Users/rishabhchopra/Library/Application Support/Google/Chrome Canary/Default',
    } );

    const page = await browser.newPage();

    await page.setViewport( {
        width: 1200,
        height: 1200,
        deviceScaleFactor: 1,
    } );

    const messages = [
        {
            "role": "system",
            "content": `You are a website crawler. 
            You will be given instructions on what to do by browsing. 
            You are connected to a web browser and you will be given the screenshot of the website 
            you are on. The links on the website will be highlighted in red in the screenshot. 
            Always read what is in the screenshot. Don't guess link names.

            You can go to a specific URL by answering with the following JSON format:
            {"url": "url goes here"}

            You can click links on the website by referencing the text inside of the link/button, 
            by answering in the following JSON format:
            {"click": "Text in link"}

            Once you are on a URL and you have found the answer to the user's question, you can answer 
            with a regular message.

            Use google search by set a sub-page like 'https://google.com/search?q=search' if applicable.
            Prefer to use Google for simple queries. If the user provides a direct URL, go to that one. 
            Do not make up links
            Feel free to do as much research as you want to and crawl as many pages as you want to 
            till you get the answer you want. 
            `
        }
    ];

    console.log("GPT: How can I assist you today?")
    const prompt = await input("You: ");
    console.log();

    messages.push({
        "role": "user",
        "content": prompt,
    });

    let url;
    let screenshot_taken = false;
    let screenshot_number = 1

    while( true ) {
        if( url ) {
            console.log("Crawling " + url);
            await page.goto( url, {
                waitUntil: "domcontentloaded",
                timeout: timeout,
            } );

            await Promise.race( [
                waitForEvent(page, 'load'),
                sleep(timeout)
            ] );

            await highlight_links( page );

            await page.screenshot( {
                path: `screenshot-${screenshot_number}.jpg`,
                fullPage: true,
            } );

            screenshot_taken = true;
            url = null;
        }

        if( screenshot_taken ) {
            const base64_image = await image_to_base64(`screenshot-${screenshot_number}.jpg`);
            
            messages.push({
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": base64_image,
                    },
                    {
                        "type": "text",
                        "text": "Here's the screenshot of the website you are on right now. You can click on links with {\"click\": \"Link text\"} or you can crawl to another URL if this one is incorrect. If you find the answer to the user's question, you can respond normally.",
                    }
                ]
            });

            screenshot_taken = false;
            screenshot_number++
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4-vision-preview",
            max_tokens: 1024,
            messages: messages,
        });

        const message = response.choices[0].message;
        const message_text = message.content;

        messages.push({
            "role": "assistant",
            "content": message_text,
        });

        console.log( "GPT: " + message_text );

        if (message_text.indexOf('{"click": "') !== -1) {
            let parts = message_text.split('{"click": "');
            parts = parts[1].split('"}');
            const link_text = parts[0].replace(/[^a-zA-Z0-9 ]/g, '');
        
            console.log("Clicking on " + link_text)
        
            try {
                const elements = await page.$$('[gpt-link-text]');
        
                let partial;
                let exact;
        
                for (const element of elements) {
                    const attributeValue = await element.evaluate(el => el.getAttribute('gpt-link-text'));
        
                    if (attributeValue.includes(link_text)) {
                        partial = element;
                    }
        
                    if (attributeValue === link_text) {
                        exact = element;
                    }
                }
        
                if (exact || partial) {
                    const [response] = await Promise.all([
                        page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(e => console.log("Navigation timeout/error:", e.message)),
                        (exact || partial).click()
                    ]);
        
                    // Additional checks can be done here, like validating the response or URL
                    await Promise.race( [
                        waitForEvent(page, 'load'),
                        sleep(timeout)
                    ] );

                    await highlight_links(page);
        
                    await page.screenshot({
                        path: `screenshot-${screenshot_number}.jpg`,
                        quality: 100,
                        fullpage: true
                    });
        
                    screenshot_taken = true;
                } else {
                    throw new Error("Can't find link");
                }
            } catch (error) {
                console.log("ERROR: Clicking failed", error);
        
                messages.push({
                    "role": "user",
                    "content": "ERROR: I was unable to click that element",
                });
            }
        
            continue;
        } else if (message_text.indexOf('{"url": "') !== -1) {
            let parts = message_text.split('{"url": "');
            parts = parts[1].split('"}');
            url = parts[0];
        
            continue;
        }

        const prompt = await input("You: ");
        console.log();

        messages.push({
            "role": "user",
            "content": prompt,
        });
    }
})();
