/****
 * Author: Omar KFM
 * App: Metropolitan Museum's API built with Express NodeJS & Nunjucks tamplate engine
 */

// Core modules
const express = require("express");
const app = express();
const axios = require('axios'); // HTTP promise based
const nunjucks = require("nunjucks"); // Template engine
var _ = require('lodash'); // Helper

// env variables
const port = process.env.PORT || 3000 // for different web hosts (AWS, etc.)
process.env.NODE_ENV = 'production'; // set this on AWS, Azure, localhost, etc.

// Parsing middleware
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true })); // to support URL-encoded bodies
app.use(bodyParser.json()); // to support JSON-encoded bodies

// Add static assets & resources
app.use(express.static(__dirname + '/public'));

// Log facility: create custom timestamp format for logging events
const SimpleNodeLogger = require('simple-node-logger'),
opts = {
  logFilePath:'metropolitan-museum-api.log',
  timestampFormat:'YYYY-MM-DD HH:mm:ss.SSS'
},
log = SimpleNodeLogger.createSimpleLogger( opts );

// Throttle middleware
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");

// Rate limit requests (will apply to POST only)
const getDataRateLimiter = rateLimit ({
  windowMs: 60 * 1000, // 1 minute window
  max: 500, // start blocking after 500 requests (429 response)
  message: "Too many API requests, please try again later..."
});

// Slow down requests (will apply to POST only)
const getDataSlowDown = slowDown ({
  windowMs: 60 * 1000, // 1 minute window
  delayAfter: 500, // allow 500 requests to go at full-speed, then...
  delayMs: 1000 // 501th request has a 1000ms delay, etc. (1 req/sec)
});

//------------------------------------------------------------------------------------------

// Configure Nunjucks template engine
nunjucks.configure('views', {
  autoescape: true, // automatically be escaped for safe output
  express: app
});

let parameters;
const timer = 10000; // 10 seconds timer
let artWorkIndex = 0;

// Show different artwork every 10 seconds
let intervalId = setInterval(changeArtwork, timer);

/*
Add artwork object as parameter to make it available inside Nunjucks async templates since 
Nunjucks template default behaviour is ONLY synchronous:
https://www.asyncapi.com/blog/using-nunjucks-with-asyncapi
https://codesandbox.io/s/learning-nunjucks-wis89?from-embed=&file=/src/index.js:533-543
*/
function changeArtwork() {
  parseArtwork(artWorkIndex).then(artwork => {
    parameters = {
      artwork
    };
  });
  artWorkIndex++;
}

async function parseArtwork(index) {
  return await getObjects(index);
}

// Endpoint: https://collectionapi.metmuseum.org/public/collection/v1/objects
async function getObjects(index) {
  try {
    const baseURL = 'https://collectionapi.metmuseum.org/public/collection/v1/objects';
    const url = baseURL;
    const response = await axios.get(url);
    const objectIDs = await getArtWork(response.data.objectIDs[index]);
    return objectIDs;
  } catch (err) {
    // console.error(err);
    log.error(err);
    return err;
  }
}

// Endpoint: https://collectionapi.metmuseum.org/public/collection/v1/objects/[objectID]
async function getArtWork(index) {
  const msg = `Fetching artwork objectID: ${index} from Metropolitan Museum's API ...`;
  log.info(msg);
  // console.log(msg);

  try {
    const baseURL = 'https://collectionapi.metmuseum.org/public/collection/v1/objects';
    const url = baseURL + '/' + index;
    const response = await axios.get(url);

    if (response.data && !_.isEmpty(response.data)) {
      return response.data;
    }
  } catch (err) {
    // console.error(err);
    log.error(err);
    return err;
  }
}

// Endpoint: https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=example&departmentId=6
async function getSearchArtWork(departmentId, searchTerm) {
  const msg = `Searching departmentId: ${departmentId} for artwork search keyword: ${searchTerm} ...`;
  log.info(msg);
  // console.log(msg);

  try {
    const baseURL = 'https://collectionapi.metmuseum.org/public/collection/v1/search';
    const url = baseURL + '?hasImages=true&departmentId=' + departmentId + '&q=' + searchTerm;
    const response = await axios.get(url);

    if (response.data && !_.isEmpty(response.data)) {
      return response.data;
    }
  } catch (err) {
    // console.error(err);
    log.error(err);
    return err;
  }
}

// -------------------------------------------------------------------------------------
// Routes

// Route: Landing page
app.get("/", function(req, res) {
  if (parameters){
    parameters.artwork.intervalId = intervalId;
    res.render("layout.html", parameters);
  }
  else {
    res.render('loading.html');
  }
});

// Route: POST /search (throttled)
app.post("/search", getDataRateLimiter, getDataSlowDown, async function (req, res) {
  const {departmentId, searchTerm} = req.body;
  const artworkSearchData = await getSearchArtWork(departmentId, searchTerm);
  let firstSearchResult = {};

  // Just pick the first result if API has actual results for this search term and department
  if (artworkSearchData && artworkSearchData.objectIDs) {
    firstSearchResult = await getArtWork(artworkSearchData.objectIDs[0]);
    firstSearchResult.searchedDepartment = departmentId;
    firstSearchResult.searchedTerm = searchTerm;

    const parameters = {
      firstSearchResult
    };

    res.render("layout.html", parameters);
  } else {
    // No matching search results were found!
    firstSearchResult.searchedDepartment = departmentId;
    firstSearchResult.searchedTerm = searchTerm;

    const parameters = {
      firstSearchResult
    };

    res.render("layout.html", parameters);
  }
}); 

// creating a port for server to listen on
app.listen(port, () => {
  log.info(`Metropolitan Museum's API is running on port ${port} ...`);
});


// -------------------------------------------------------------------------------------
// Error handling: 5xx & 404 errors

// Will throw intentional error with custom message
app.get('/error-route', (req, res) => {
  const msg = 'GET /error-route: Error: route is broken!';
  log.error(msg);
  res.status(500);
  res.render("5xxerrors.html", {msg: msg});
  // mimic an error by throwing an error to break the app!
  // throw new Error(msg);
})

// Should ALWAYS be added after all GET, POST routes to work correctly with Express routing tables
app.get('*', function(req, res){
  const msg = 'Error! No matching route was found!';
  log.error(msg);
  res.render("404.html", {msg: msg});
});
