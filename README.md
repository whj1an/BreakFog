# Beak Fog

## short introduce
This web program can collect main news from some of news website, like CTV news, CBC news, Global News, etc.

## How it apply
Use by Node.js to form the page

## Data Source
1. Rss Feed
CBC news - rss.cbc.ca/lineup/topstories.xml
Global news - globalnews.ca/feed/
google News - news.google.com/rss?hl=en-CA
Yahoo Finance - ca.finance.yahoo.com/news/rssindex
CBC Politics - rss.cbc.ca/lineup/politics.xml

2. server.js:9 uses rss-parser to parse XML feeds and extract extended fileds: 
- `media: content`/`media:thumbnail` -> Article image
- `content:encoded` -> Article body
- `dc:creator` -> Author

3. Data Cleaning - `cheerio`
- `stripHtml()`(server.js:67) - Uses `cheerio` to parse HTML and strip tags, returning plain text.
- `pickImage()`(server.js:73) - Searches multiple fields by priority to find an image URL.
- `normalizeItem()`(server.js:129) - Normalizes fields from different sources into a unified format.

4. API Endpoint
`GET/api/news`(server.js:165) - Sends concurrent requests to all RSS cources using `Promise.allSettled`, fetches the latest 8 articles per source, and returns JSON to the fromtend.