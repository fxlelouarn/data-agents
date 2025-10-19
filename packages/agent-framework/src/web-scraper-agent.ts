import { chromium, Browser, Page } from 'playwright'
import { BaseAgent } from './base-agent'
import { AgentContext, AgentRunResult, ExtractionResult } from './types'

export abstract class WebScraperAgent extends BaseAgent {
  protected browser?: Browser
  protected page?: Page

  // Abstract method for specific scraping logic
  abstract scrapeData(page: Page, context: AgentContext): Promise<ExtractionResult[]>

  async run(context: AgentContext): Promise<AgentRunResult> {
    const startTime = Date.now()
    let extractedData: ExtractionResult[] = []

    try {
      context.logger.info('Starting web scraping agent')

      // Initialize browser
      await this.initBrowser()
      
      if (!this.page) {
        throw new Error('Failed to initialize browser page')
      }

      // Execute scraping logic
      extractedData = await this.scrapeData(this.page, context)
      
      context.logger.info(`Extracted data from ${extractedData.length} sources`)

      const duration = Date.now() - startTime

      return {
        success: true,
        extractedData,
        message: `Successfully extracted data from ${extractedData.length} sources`,
        metrics: {
          duration,
          sourcesProcessed: extractedData.length,
          totalEvents: extractedData.reduce((sum, result) => sum + result.events.length, 0),
          totalEditions: extractedData.reduce((sum, result) => sum + result.editions.length, 0),
          totalRaces: extractedData.reduce((sum, result) => sum + result.races.length, 0)
        }
      }

    } catch (error) {
      context.logger.error('Web scraping failed', { 
        error: error?.toString(),
        stack: error instanceof Error ? error.stack : undefined
      })

      return {
        success: false,
        message: `Web scraping failed: ${error}`,
        extractedData: extractedData.length > 0 ? extractedData : undefined,
        metrics: {
          duration: Date.now() - startTime,
          error: error?.toString()
        }
      }
    } finally {
      await this.cleanup()
    }
  }

  protected async initBrowser(): Promise<void> {
    try {
      // Launch browser with appropriate settings
      this.browser = await chromium.launch({
        headless: true, // Set to false for debugging
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      })

      // Create new page
      this.page = await this.browser.newPage()

      // Set user agent to avoid detection  
      await this.page.context().addInitScript(() => {
        Object.defineProperty(navigator, 'userAgent', {
          get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })
      })

      // Set viewport
      await this.page.setViewportSize({ width: 1920, height: 1080 })

      // Set reasonable timeout
      this.page.setDefaultTimeout(30000)

    } catch (error) {
      throw new Error(`Failed to initialize browser: ${error}`)
    }
  }

  protected async navigateToUrl(url: string, waitForSelector?: string): Promise<void> {
    if (!this.page) {
      throw new Error('Browser page not initialized')
    }

    try {
      this.logger.info(`Navigating to ${url}`)
      
      await this.page.goto(url, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      })

      if (waitForSelector) {
        await this.page.waitForSelector(waitForSelector, { timeout: 10000 })
      }

      // Wait a bit for dynamic content
      await this.page.waitForTimeout(2000)

    } catch (error) {
      throw new Error(`Failed to navigate to ${url}: ${error}`)
    }
  }

  protected async takeScreenshot(filename?: string): Promise<string | undefined> {
    if (!this.page) return undefined

    try {
      const screenshotPath = filename || `screenshot-${Date.now()}.png`
      await this.page.screenshot({ path: screenshotPath, fullPage: true })
      return screenshotPath
    } catch (error) {
      this.logger.warn('Failed to take screenshot', { error: error?.toString() })
      return undefined
    }
  }

  protected async extractTextFromSelector(selector: string): Promise<string[]> {
    if (!this.page) return []

    try {
      const elements = await this.page.$$(selector)
      const texts = []
      
      for (const element of elements) {
        const text = await element.textContent()
        if (text?.trim()) {
          texts.push(text.trim())
        }
      }
      
      return texts
    } catch (error) {
      this.logger.warn(`Failed to extract text from selector ${selector}`, { 
        error: error?.toString() 
      })
      return []
    }
  }

  protected async extractLinksFromSelector(selector: string): Promise<string[]> {
    if (!this.page) return []

    try {
      const links = await this.page.$$eval(selector, elements =>
        elements
          .map(el => el.getAttribute('href'))
          .filter(href => href !== null) as string[]
      )
      
      return links.map(link => {
        // Convert relative URLs to absolute
        try {
          return new URL(link, this.page!.url()).href
        } catch {
          return link
        }
      })
    } catch (error) {
      this.logger.warn(`Failed to extract links from selector ${selector}`, { 
        error: error?.toString() 
      })
      return []
    }
  }

  protected async waitForElement(selector: string, timeout: number = 10000): Promise<boolean> {
    if (!this.page) return false

    try {
      await this.page.waitForSelector(selector, { timeout })
      return true
    } catch {
      return false
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.page) {
        await this.page.close()
        this.page = undefined
      }
      
      if (this.browser) {
        await this.browser.close()
        this.browser = undefined
      }
    } catch (error) {
      this.logger.warn('Error during cleanup', { error: error?.toString() })
    }
  }

  // Utility method to validate URLs
  protected isValidUrl(url: string): boolean {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  // Utility method to clean extracted text
  protected cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .trim()
  }
}