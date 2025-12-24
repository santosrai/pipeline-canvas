import asyncio
from playwright import async_api
from playwright.async_api import expect

async def run_test():
    pw = None
    browser = None
    context = None
    
    try:
        # Start a Playwright session in asynchronous mode
        pw = await async_api.async_playwright().start()
        
        # Launch a Chromium browser in headless mode with custom arguments
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",         # Set the browser window size
                "--disable-dev-shm-usage",        # Avoid using /dev/shm which can cause issues in containers
                "--ipc=host",                     # Use host-level IPC for better stability
                "--single-process"                # Run the browser in a single process mode
            ],
        )
        
        # Create a new browser context (like an incognito window)
        context = await browser.new_context()
        context.set_default_timeout(5000)
        
        # Open a new page in the browser context
        page = await context.new_page()
        
        # Navigate to your target URL and wait until the network request is committed
        await page.goto("http://localhost:3000", wait_until="commit", timeout=10000)
        
        # Wait for the main page to reach DOMContentLoaded state (optional for stability)
        try:
            await page.wait_for_load_state("domcontentloaded", timeout=3000)
        except async_api.Error:
            pass
        
        # Iterate through all iframes and wait for them to load as well
        for frame in page.frames:
            try:
                await frame.wait_for_load_state("domcontentloaded", timeout=3000)
            except async_api.Error:
                pass
        
        # Interact with the page elements to simulate user flow
        # -> Click on 'Pipeline Canvas' button to open the pipeline canvas where HTTP Request node can be added.
        frame = context.pages[-1]
        # Click on 'Pipeline Canvas' button to open the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/header/div[2]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Retry clicking 'Pipeline Canvas' button or find another way to open the pipeline canvas to add HTTP Request node.
        frame = context.pages[-1]
        # Retry clicking 'Pipeline Canvas' button to open the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/header/div[2]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Add Node' button to add a new node to the pipeline canvas.
        frame = context.pages[-1]
        # Click on 'Add Node' button to add a new node to the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on the 'HTTP Request' node in the Node Palette to add it to the pipeline canvas.
        frame = context.pages[-1]
        # Click on 'HTTP Request' node to add it to the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div[2]/div/div/button[6]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Pipeline Canvas' button to reopen the pipeline canvas and add the HTTP Request node again.
        frame = context.pages[-1]
        # Click on 'Pipeline Canvas' button to reopen the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/header/div[2]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Add Node' button to open the Node Palette for adding a new node.
        frame = context.pages[-1]
        # Click on 'Add Node' button to open the Node Palette
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on the 'HTTP Request' node (index 36) to add it to the pipeline canvas.
        frame = context.pages[-1]
        # Click on 'HTTP Request' node to add it to the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div[2]/div/div/button[6]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Input an absolute URL without template variables into the HTTP Request node's URL field.
        frame = context.pages[-1]
        # Click on the HTTP Request node to open its configuration panel
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div[2]/div[2]/div/div/div/div/div[2]/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Pipeline Canvas' button to reopen the pipeline canvas and add the HTTP Request node again.
        frame = context.pages[-1]
        # Click on 'Pipeline Canvas' button to reopen the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/header/div[2]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Add Node' button to open the Node Palette for adding a new node.
        frame = context.pages[-1]
        # Click on 'Add Node' button to open the Node Palette
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on the 'HTTP Request' node (index 36) to add it to the pipeline canvas.
        frame = context.pages[-1]
        # Click on 'HTTP Request' node to add it to the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div[2]/div/div/button[6]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Input an absolute URL without template variables into the HTTP Request node's URL field.
        frame = context.pages[-1]
        # Click on the HTTP Request node to open its configuration panel
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div[2]/div[2]/div/div/div/div/div[2]/div').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Pipeline Canvas' button to reopen the pipeline canvas and add the HTTP Request node again.
        frame = context.pages[-1]
        # Click on 'Pipeline Canvas' button to reopen the pipeline canvas
        elem = frame.locator('xpath=html/body/div/div/header/div[2]/button[2]').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # -> Click on 'Add Node' button to open the Node Palette for adding a new node.
        frame = context.pages[-1]
        # Click on 'Add Node' button to open the Node Palette
        elem = frame.locator('xpath=html/body/div/div/div/div[3]/div[2]/div/div/div[2]/button').nth(0)
        await page.wait_for_timeout(3000); await elem.click(timeout=5000)
        

        # --> Assertions to verify final state
        frame = context.pages[-1]
        try:
            await expect(frame.locator('text=HTTP Request Execution Successful').first).to_be_visible(timeout=1000)
        except AssertionError:
            raise AssertionError("Test case failed: The GET request execution using an absolute URL without authentication did not succeed as expected. The output panel did not show the HTTP 200 status code or the expected response data.")
        await asyncio.sleep(5)
    
    finally:
        if context:
            await context.close()
        if browser:
            await browser.close()
        if pw:
            await pw.stop()
            
asyncio.run(run_test())
    