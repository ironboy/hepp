const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
app.use(express.json());
app.use(function (error, req, res, next) {
  res.json({ error: error + '' });
});

// Demand specifying test
let testToRun = process.argv[2];
if(!testToRun){
  console.warn('Please specify a test... Closing down!');
  process.exit();
}
testToRun = path.join(__dirname, 'tests', testToRun);

if(!fs.existsSync(testToRun)){
  console.warn('Could not find the test "' + testToRun + '"');
  process.exit();
}

let serve = {
  'questions.js': '',
  'settings.js': '',
  'port.json': 3000
};

let resultsFolder = path.join(testToRun, 'results');
// Create the results folder if it doesn't exists
if(!fs.existsSync(resultsFolder)){
  fs.mkdirSync(resultsFolder);
}

for(let key in serve){
  let p = path.join(testToRun, key);
  if(!fs.existsSync(testToRun)){ 
    if(key === 'port.json'){ continue; }
    console.warn('Could not find ' + key);
    process.exit();  
  }
  serve[key] = fs.readFileSync(p, 'utf-8');
}



// Get port from port.json in the current test folder
let port = serve['port.json'];

// Read settings
const settingsTxt = serve['settings.js'];
const serveProtected = !!(settingsTxt.match(/protect:\s*true/))
const solutionsShouldBeShown = !!(settingsTxt.match(/showSolutions:\s*true/));
console.log('Serving protected ', serveProtected);
console.log('Show solutions', solutionsShouldBeShown);

if(!serveProtected){
  app.get('/testdata/settings.js', (req,res) => {
    res.setHeader('Content-Type', 'application/js');
    res.send(serve['settings.js']);
  });
  
  app.get('/testdata/questions.js', (req,res) => {
    res.setHeader('Content-Type', 'application/js');
    res.send(serve['questions.js']);
  });
}


const btoa = function (str) { return Buffer.from(str, 'latin1').toString('base64'); }
const atob = function (b64Encoded) { return Buffer.from(b64Encoded, 'base64').toString('latin1'); }

app.post('/turn-in', (req, res) => {
  let fname = path.join(resultsFolder, btoa(encodeURIComponent(req.body.email + 'xxx'))) + '.json';
  if (fs.existsSync(fname)) {
    res.json({ error: 'already registrered' });
  }
  else {
    fs.writeFileSync(fname, JSON.stringify(Object.assign({
      turnedInWhen: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString()
    }, req.body), '', '  '), 'utf-8');
    res.json({ success: 'saved' });
  }
});

if (serveProtected) {

  // build questions with solutions removed
  let questions = '';
  global.Question = class Q {
    constructor(max, html, htmlEn, test, start, solutions){
      questions += `new Question(${max},\`${html}\`, \`${htmlEn}\`, ${test}, ${start}, []);`;
    }
  }
  !solutionsShouldBeShown && require(path.join(testToRun, 'questions.js'));

  let files = [
    '/testdata/settings.js',
    '/js/Question.js',
    '/testdata/questions.js'
  ];

  let toServe = '';

  for (let file of files) {
    if(file === '/testdata/questions.js' && questions){
      console.log("Solutions removed");
      toServe += questions + '\n';
    } else {
      if(file.indexOf('/testdata/') === 0){
        toServe += serve[file.split('/').pop()] + '\n';
      }
      else {
        toServe += fs.readFileSync('./www' + file, 'utf-8') + '\n';
      }
    }
    app.all(file, (req, res) => {
      if (files.includes(req.url)) {
        res.send(toServe[files.indexOf(req.url)]);
      }
      else {
        res.send('');
      }
    });
  }
  toServe = '(()=>{' + toServe + '\n})();';
  toServe = btoa(encodeURIComponent(toServe).split('').reverse().join(''));
  toServe = ['x=`' + toServe + '`', 'eval(decodeURIComponent(atob(x).split("").reverse().join("")))', 'delete window.x'];
}

app.get('/results-ya-know/:pass/:has', (req, res) => {
  let sent = false;
  if (req.params.pass !== 'stringnumberboolean') {
    res.json({ error: true });
  }
  let data = getResults();
  let to, toPull;
  if (!isNaN(req.params.has) && req.params.has / 1 === data.length) {
    to = setTimeout(() => {
      res.json({ nochange: true });
      sent = true;
      clearInterval(toPull);
    }, 25000);
    toPull = setInterval(() => {
      data = getResults();
      if(data.length !== req.params.has / 1 ){
        clearTimeout(to);
        clearInterval(toPull);
        !sent && res.json(data);
        sent = true;
      }
    }, 1000);
  }
  else {
    !sent && res.json(data);
    sent = true;
  }
});

function getResults() {
  let files = fs.readdirSync(resultsFolder);
  let data = [];
  for (let file of files) {
    if (file.substr(-5) === '.json') {
      data.push(require(path.join(resultsFolder, file)));
    }
  }
  data.sort((a, b) => a.turnedInWhen > b.turnedInWhen ? 1 : -1);
  return data;
}


app.use(express.static('www'));
app.listen(port, () => console.log('Listening on port ' + port));