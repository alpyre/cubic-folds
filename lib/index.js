var CompositeDisposable = require('atom').CompositeDisposable;
var Range = require('atom').Range;
var dialog = {
	message: "Problem (cubic-folds)",
  detailedMessage: "Fold marker(s) missing!",
  buttons: ["OK"]
};

module.exports = {

	activate: function(state) {
		this.subscriptions = new CompositeDisposable();

		atom.commands.add('atom-workspace', {
			'cubic-folds:toggleFold-this': this.toggleFold.bind(this),
			'cubic-folds:toggleFold-all': this.toggleFoldAll.bind(this),
			'cubic-folds:fold-all': this.foldAll.bind(this),
			'cubic-folds:unfold-all': this.unfoldAll.bind(this),
		});

		setTimeout(() => this.foldAll("quiet"), 500);
	},

	deactivate: function() {
		this.subscriptions.dispose();
	},

	foldMarker: /\/\/\//, // Regex for fold markers
	foldLength: 200, // How many characters to show of the fold line

	/**
	* Traverse through the entire document and locate all foldable sections
	* Return an object of two arrays containing all the rows for start and end of the fold sections and the currentSection
	* @param {number} [row] When given this row will be evaluated otherwise current cursor position will be used
	* @return {null|object} An object of two arrays for the start and end of the fold sections and the currentSection.
	*                       In case of faulty fold markers returns null
	*/
	findSections: function(row) {
		var editor = atom.workspace.getActiveTextEditor();
		if (!editor) return;

		var lineCount = editor.getLineCount();
		if (!row) row = editor.getCursorBufferPosition().row;

		var sections = {
			sectionStart: [],
			sectionEnd: [],
			currentSection: 0
		};

		// Traverse through the document for fold markers '///'
		for (var r = 0; r < lineCount; r++) {
			var line = editor.lineTextForBufferRow(r);
			//Find a fold start marker
			if (this.foldMarker.test(line) && r != lineCount) {
				sections.sectionStart.push(r);
				if (r == row) sections.currentSection = sections.sectionStart.length;  // cursor is on the fold start line
				//Find the corresponding fold end marker
				for(++r; r < lineCount; r++) {
					if (r == row) sections.currentSection = sections.sectionStart.length;  // cursor is within the fold section
					line = editor.lineTextForBufferRow(r);
					if (this.foldMarker.test(line)) {
						sections.sectionEnd.push(r);
						break;
					}
				}
			}
		}

		//Every fold marker must have a corresponding fold end marker
		if (sections.sectionStart.length && sections.sectionStart.length == sections.sectionEnd.length)
			return sections; //there are markers and they are even
		else
			return null; //there are no markers or they are not even
	},

	/*
	 * Fold all foldable sections in the document
	 */
	foldAll: function() {
		var editor = atom.workspace.getActiveTextEditor();
		if (!editor) return;

		//Memorize the current cursor position
		var oldCursorPos = editor.getCursorBufferPosition();

		//Get all foldable sections
		var sections = this.findSections();

		if (!sections) {
			if (!(arguments[0] === "quiet")) {
				atom.confirm(dialog);
			}
			return;
		}

		//Create the ranges and fold the sections
		for (s = 0; s < sections.sectionStart.length; s++) {
			editor.setSelectedBufferRange(new Range([sections.sectionStart[s], this.foldLength], [sections.sectionEnd[s], this.foldLength]));
			editor.foldSelectedLines();
		}

		//put the cursor back at its initial position
		editor.setCursorBufferPosition(oldCursorPos);
	},

	/*
	 * Unfold all folded sections in the document
	 */
	unfoldAll: function() {
		var editor = atom.workspace.getActiveTextEditor();
		if (!editor) return;

		//Get all foldable sections
		var sections = this.findSections();

		if (!sections) {  // bad markers                        !CONSIDER USER NOTIFICATION HERE
			if (!this.unfoldAllCubic())
				atom.confirm(dialog);
			return;
		}

		for (s = 0; s < sections.sectionStart.length; s++) {
			editor.unfoldBufferRow(sections.sectionStart[s]);
		}
	},

	toggleFoldAll: function() {
		var editor = atom.workspace.getActiveTextEditor();
		if (!editor) return;

		//Get all foldable sections
		var sections = this.findSections();

		if (!sections) {  												// bad markers
			if (!this.unfoldAllCubic())
				atom.confirm(dialog);
			return;
		}

		//Memorize the current cursor position
		var oldCursorPos = editor.getCursorBufferPosition();

		var didUnfold = false;
		//Traverse through all foldable sections to
		//determine to fold or unfold all
		//if any folded section is present, unfold all immediately
		for (s = 0; s < sections.sectionStart.length; s++) {
			if (editor.isFoldedAtBufferRow(sections.sectionStart[s])) {
				didUnfold = true;
				editor.unfoldBufferRow(sections.sectionStart[s]);
			}
		}

		if (didUnfold)
			return;

		//Create the ranges and fold the sections
		for (s = 0; s < sections.sectionStart.length; s++) {
			editor.setSelectedBufferRange(new Range([sections.sectionStart[s], this.foldLength], [sections.sectionEnd[s], this.foldLength]));
			editor.foldSelectedLines();
		}

		//put the cursor back at its initial position
		editor.setCursorBufferPosition(oldCursorPos);
	},

	/*
	 * If the cursor is on a folded line unfold it
	 * If the cursor is within valid fold marked section fold it
 	 * otherwise do nothing
	*/
	toggleFold: function() {
		var editor = atom.workspace.getActiveTextEditor();
		if (!editor) return;

		//Determine to unfold or fold!
		var row = editor.getCursorBufferPosition().row;
		if (editor.isFoldedAtCursorRow()) {
			editor.unfoldBufferRow(row);
			return;
		}

		//Get all foldable sections
		var sections = this.findSections();
		if (!sections) {
			atom.confirm(dialog);
			return;
		}

		//Memorize the current cursor position
		var oldCursorPos = editor.getCursorBufferPosition();

		if (sections.currentSection) {
			var s = sections.currentSection - 1;
			editor.setSelectedBufferRange(new Range([sections.sectionStart[s], this.foldLength], [sections.sectionEnd[s], this.foldLength]));
			editor.foldSelectedLines();
		}

		//put the cursor back at its initial position
		editor.setCursorBufferPosition(oldCursorPos);
	},

	/*
	 * Unfolds all Cubic style folds without confirming valid markers
	 * Returns true if it finds and unfolds any folded rows
	 */
	unfoldAllCubic: function() {
		var editor = atom.workspace.getActiveTextEditor();
		if (!editor) return;

		var lineCount = editor.getLineCount();
		var didUnfold = false;

		//traverse through the document and detect all cubic stlye fold markers
		for (var r = 0; r < lineCount; r++) {
			var line = editor.lineTextForBufferRow(r);
			if (this.foldMarker.test(line) && editor.isFoldedAtBufferRow(r)) {
				editor.unfoldBufferRow(r);
				didUnfold = true;
			}
		}

		return didUnfold;
	}
};
