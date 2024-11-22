const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 8080;  // Use Heroku's dynamic port

// Serve static files (HTML, CSS, etc.)
app.use(express.static('public'));

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Route for the home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to handle form submission and crawl data
app.post('/scrape', async (req, res) => {
    const keyword = req.body.keyword;
    if (!keyword) {
        return res.send('Please enter a keyword to search.');
    }

    const encodedKeyword = encodeURIComponent(keyword);
    let targetUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C5&q=${encodedKeyword}&btnG=`;

    let urlsToVisit = [targetUrl];
    const maxCrawlLength = 20;
    let crawledCount = 0;
    const articleData = [];
    const visitedUrls = new Set();
    let crawlFinished = false;

    const timeout = setTimeout(() => {
        if (!crawlFinished) {
            console.log('Timeout reached, sending partial results...');
            res.render('results', { articles: articleData, keyword: keyword });
        }
    }, 30000);

    try {
        for (; urlsToVisit.length > 0 && crawledCount < maxCrawlLength;) {
            const currentUrl = urlsToVisit.shift();

            if (visitedUrls.has(currentUrl)) continue;

            visitedUrls.add(currentUrl);
            crawledCount++;

            try {
                const response = await axios.get(currentUrl, { timeout: 10000 });
                const $ = cheerio.load(response.data);

                const linkElements = $('a');
                linkElements.each((index, element) => {
                    let url = $(element).attr('href');
                    if (url && url.startsWith("https://") && !visitedUrls.has(url) && !url.includes("google") && !url.includes("download")) {
                        urlsToVisit.push(url);
                    }
                });

                if (crawledCount > 1) {
                    const data = {};
                    data.url = currentUrl;
                    data.title = $('title').text().trim();

                    if (currentUrl.includes('hal.science')) {
                        const abstractText = $('div.abstract').text().trim();
                        data.abstract = abstractText || "Abstract not found";
                    } else {
                        data.abstract = $('*:contains("Abstract")').filter((_, el) => $(el).text().trim() === "Abstract")
                            .nextUntil(':header')
                            .text()
                            .trim();
                    }

                    articleData.push(data);
                }

            } catch (fetchError) {
                console.error(`Error fetching ${currentUrl}: ${fetchError.message}`);
            }
        }

        crawlFinished = true;
        clearTimeout(timeout);

        res.render('results', { articles: articleData, keyword: keyword });

    } catch (error) {
        console.error('Error during crawling:', error.message);
        res.send('Error occurred while scraping. Please try again later.');
    }
});

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
