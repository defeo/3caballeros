// Append nodes, a la Jade
Element.prototype.append = function(jade, ns) {
    var format = /^([a-z1-6]+)((?:\.[^ #.]+|#[^ #.]+)*)(?:\s(.*))?$/i;
    var lines = jade.split('\n');
    var match = format.exec(lines[0]);
    if (!match)
	throw "Invalid tag format: " + jade
    var tag = match[1];
    var classes = match[2].match(/\.[^#.]+/g) || [];
    var id = match[2].match(/#[^#.]+/);
    if (match[3]) 
	lines[0] = match[3];
    else 
	lines.shift();
    var html = lines.join('\n');

    var elt;
    if (ns !== undefined)
	elt = document.createElementNS(ns, tag);
    else
	elt = document.createElement(tag);
    for (var i = 0; i < classes.length; i++)
	elt.classList.add(classes[i].substring(1));
    if (id)
	elt.id = id[0].substring(1);
    if (html)
	elt.innerHTML = html;

    return this.appendChild(elt);
}
Element.prototype.$ = Element.prototype.querySelector;
Element.prototype.$$ = Element.prototype.querySelectorAll;

class Voices {
    constructor(lang) {
	this.lang = lang;
	this.selected = null;

 	this.domNode = document.createElement('select');
	this.domNode.classList.add('voice');
	this.domNode.addEventListener('change', () => {
	    this.selected = this.voices[this.domNode.value];
	    this.onselected && this.onselected(this.selected);
	});
	
 	this.updateVoices();
	speechSynthesis.addEventListener('voiceschanged', this.updateVoices.bind(this));
   }

    updateVoices() {
	this.voices = speechSynthesis.getVoices().filter((v) => v.lang == this.lang);
	this.domNode.innerHTML = "";
	this.voices.forEach((v, i) => {
	    let opt = this.domNode.append('option');
	    opt.value = i;
	    opt.textContent = `${v.name} (${v.lang})`;
	    if (this.selected == v)
		opt.selected = true;
	});
	if (this.voices.length > 0) {
	    this.domNode.classList.remove('novoices');
	    if (this.selected === null)
		this.selected = this.voices[0];
	} else {
	    this.domNode.classList.add('novoices');
	    this.selected = null;
	}
    }
}

class Character {
    constructor(name, lang, volume) {
	this.name = name;
	this.lang = lang;
	this.volume = volume === undefined ? 1 : volume;
	this.pronounced = new SpeechSynthesisUtterance(name);
	this.voice = new Voices(lang);
	this.voice.onselected = () => this.pronounce();
    }

    render() {
	let li = document.createElement('li');
	li.dataset.name = this.name;
	li.dataset.lang = this.lang;
	li.append('span ' + this.name);
	let vol = li.append('input.volume');
	vol.type = "range";
	vol.min = "0.01";
	vol.max = "1.0";
	vol.step = "0.01";
	vol.value = "1";
	vol.addEventListener('change', () => {
	    this.volume = parseFloat(vol.value);
	    if (this.muted()) {
		li.classList.add('muted');
	    } else {
		li.classList.remove('muted');
	    }
	    this.pronounce();
	});

	li.appendChild(this.voice.domNode);
	return li;
    }

    muted() {
	return this.volume <= 0.01;
    }
    
    speak(utterance) {
	utterance.voice = this.voice.selected;
	utterance.volume = this.volume;
	return new Promise((resolve, reject) => {
	    console.log(utterance);
	    speechSynthesis.speak(utterance);
	    utterance.onend = resolve;
	    utterance.onerror = reject;
	});
    }

    pronounce() {
	this.speak(this.pronounced);
    }
}

class Sentence {
    constructor(text, characters, domNode) {
	this.text = text;
	this.characters = characters;
	this.domNode = domNode;
	this.utterance = new SpeechSynthesisUtterance(text);
    }
    
    speak() {
	let char = this.characters.find((c) => !c.muted()) || this.characters[0];
	this.domNode.classList.add('speaking');
	window.scrollTo(0, this.domNode.getBoundingClientRect().top
			+ window.pageYOffset - (window.innerHeight / 2));
	return timeout(500)
	    .then(() => char.speak(this.utterance))
	    .then(() => {
		this.domNode.classList.remove('speaking');
		return timeout(500)
	    });
    }
}

class Play {
    constructor(doc) {
	this.document = doc;
	this.title = doc.$('title').textContent;
	this.lang = doc.getAttribute('lang');
	this.sentences = [];
	this.characters = {};
	this.playing = false;

	this.domNode = document.createElement('div');
	this.domNode.className = 'play';
	this.domNode.append("h1 " + this.title);

	for (let chap of doc.$$('chapter')) {
	    this.domNode.append('h2 ' + chap.$('title').textContent);
	    for (let para of chap.$$('para')) {
		let p = this.domNode.append('p');
		let c = para.getAttribute('character');
		let text = '';
		for (let node of para.childNodes) {
		    if (node instanceof Text) {
			p.append('span ' + node.wholeText);
			text += node.wholeText;
		    } else if (node.tagName == "mood") {
			p.append('span.mood ' + node.textContent);
		    } else {
			console.log('wtf:', node);
		    }
		}
		
		if (c) {
		    let cs = c.split(',');
		    p.dataset.character = cs.join(', ');
		    let chars = cs.map((c) => 
				       this.characters[c]
				       || (this.characters[c] = new Character(c, this.lang)));
		    this.sentences.push(new Sentence(text, chars, p));
		    let i = this.sentences.length - 1;
		    p.onclick = () => this.select(i);
		}
	    }
	}
	
	this.current = -1;
	this.increaseCurrent();
    }

    increaseCurrent() {
	if (this.current >= 0)
	    this.sentences[this.current].domNode.classList.remove('current');
	this.current = (this.current + 1) % this.sentences.length;
	this.sentences[this.current].domNode.classList.add('current');
	return this.current;
    }

    select(i) {
	if (!this.playing && i >=0 && i < this.sentences.length) {
	    this.sentences[this.current].domNode.classList.remove('current');
	    this.current = i;
	    this.sentences[this.current].domNode.classList.add('current');
	}
    }
    
    play() {
	return new Promise((resolve, reject) => {
	    if (!this.playing) {
		this.playing = true;
		this.domNode.classList.add('playing');
		let go = () => {
		    return this.sentences[this.current].speak()
			.then(() => {
			    if (this.playing && this.increaseCurrent() > 0)
				return go();
			    else {
				this.playing = false;
				this.domNode.classList.remove('playing');
				return resolve();
			    }
			})
			.catch((e) => {
			    console.log(e);
			    this.playing = false;
			    this.domNode.classList.remove('playing');
			    return reject(e);
			});
		};
		return go();
	    } else {
		return reject(new Error("Already playing"));
	    }
	});
    }
    
    pause() {
	if (this.playing) {
	    speechSynthesis.cancel();
	    this.playing = false;
	}
    }
}

function timeout(timeout) {
    return new Promise((resolve, reject) => {
	setTimeout(() => resolve(), timeout);
    });
}

fetch('aventuriers-synopsis.xml')
    .then((res) => res.text())
    .then((text) => {
	let $ = document.querySelector.bind(document);
	let $$ = document.querySelectorAll.bind(document);
	let append = (elt, tag) => elt.appendChild(document.createElement(tag));

	let parser = new DOMParser();

	let menu = document.body.append("div#menu");
	menu.append('div#toggle').onclick = (e) => menu.classList.toggle('toggled');
	let start = menu.append('div#startstop');
	
	let xml = parser.parseFromString(text, "application/xml").children[0];
	let play = new Play(xml);
	document.body.appendChild(play.domNode);
	document.title += " · " + play.title;

	let chars = menu.append('ul#characters');
	for (let c in play.characters) {
	    chars.appendChild(play.characters[c].render());
	}

	start.addEventListener('click', (e) => {
	    if (play.playing) {
		start.classList.remove('playing');
		play.pause();
	    } else {
		start.classList.add('playing');
		play.play()
		    .then(() => start.classList.remove('playing'))
		    .catch((e) => console.log(e));
	    }
	});
    });
