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

fetch('aventuriers-synopsis.xml')
    .then((res) => res.text())
    .then((text) => {
	let $ = document.querySelector.bind(document);
	let $$ = document.querySelectorAll.bind(document);
	let append = (elt, tag) => elt.appendChild(document.createElement(tag));

	let parser = new DOMParser();
	let xml = parser.parseFromString(text, "application/xml").children[0];
	let lang = xml.getAttribute('lang');
	document.body.append("h1 " + xml.$('title').textContent);
	let chars = document.body.append("ul#characters");
	let play = document.body.append("div#play");

	characters = {};
	sentences = [];

	for (let chap of xml.$$('chapter')) {
	    play.append('h2 ' + chap.$('title').textContent);
	    for (let para of chap.$$('para')) {
		let p = play.append('p');
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
		    let sentence = {
			text: text,
			speech: new SpeechSynthesisUtterance(text),
			characters: cs,
			paragraph: p,
		    };
		    sentence.speech.onend = (e) =>
			sentence.next && speechSynthesis.speak(sentence.next.speech);
		    if (sentences.length > 0)
			sentences[sentences.length-1].next = sentence;
		    sentences.push(sentence);
		    cs.forEach((c) => characters[c] = {
			name: c,
			sentence: sentence,
		    });
		}
	    }
	}

	for (let c in characters) {
	    let li = chars.append('li ' + c);
	    li.dataset.character = c;
	    li.addEventListener('click', (e) => li.classList.toggle('muted'));
	}

	play.addEventListener('click', (e) => {
	    if (!speechSynthesis.speaking)
		speechSynthesis.speak(sentences[0].speech);
	});
    });
