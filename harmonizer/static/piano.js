const sequence_length = 8; //the number of melody-chords passed to the model
const file_format = "mp3"; //the file format for the audio files
const acc_vol = 0.3; //the volume of the accompaniment
const pitch_min = 48; //the lowest pitch that can be output by the ML model
const pitch_max = 72; //the highest pitch that can be output by the ML model
const max_notes = 8; //the max number of sound files that can be played at once
const num_displayed_notes = sequence_length; //the max number of previous notes shown on the screen

var latestMelodyChords = []; //latest played melody-chord-pairs, which will be passed into the ML model
var latestKeysAlphabetic = []; //latests pressed keys in alphabetic form, used for updating the notes correctly
var lastChord = new Array(pitch_max - pitch_min + 1).fill(0); //the last chord played by the ML model

keys = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 *  Translates a piano key to a vector that can be passed into the model
 */
function keyToVector(octave, key) {
    input_note = octave * 12 + (key - 9) % 12;
    vector = new Array(88).fill(0);
    vector[input_note] = 1;
    return vector;
}

/**
 *  Takes an output from the LSTM-model as a list and plays the chord corresponding to it
 */
function playChord(chord) {
    sounds = [];
    for (i in chord) {
        octave = Math.floor((chord[i] - 12)/ 12);
        key = keys[(chord[i] - 12) % 12];
        sound = new Audio("static/sounds/" + key + octave + "." + file_format);
        sound.volume = acc_vol;
        sound.load();
        sounds.push(sound);
    }
    for (i in sounds) {
        if (i >= max_notes) {
            break;
        }
        sounds[i].play();
    }
}

/**
 *  Event listener for clicking on the interactive piano
 */
function keyPressed(event) {
    
    // Play the sound of the pressed key
    pressedKey = "";
    target = event.target;
    targetClasses = target.className.split(" ");
    if (targetClasses.includes("key")) {
        pressedKey = target.id;
        sound = new Audio("static/sounds/" + pressedKey + "." + file_format);
        sound.load();
        sound.play();
    }
    else if (target.parentElement.className.split(" ").includes("key")) {
        pressedKey = event.target.parentElement.id;
        sound = new Audio("static/sounds/" + pressedKey + "." + file_format);
        sound.load();
        sound.play();
    }
    else {
        return;
    }
    
    // Update memory of pressed keys
    octave = pressedKey.charAt(pressedKey.length - 1);
    key = keys.indexOf(pressedKey.substring(0, pressedKey.length - 1));
    vector = keyToVector(octave, key);
    latestMelodyChords.push(lastChord.concat(vector));
    
    // Predict the chord using the ML model, then play the chord
    if (latestMelodyChords.length == sequence_length) {
        $.post('/predict', {sequence: JSON.stringify(latestMelodyChords)}, function(response) {
            pitches = JSON.parse(response);
            playChord(pitches);
            lastChord = new Array(pitch_max - pitch_min + 1).fill(0);
            for (i in pitches) {
                lastChord[pitches[i] - pitch_min] = 1;
            }
        });
    }
    
    // Make sure that only the last sequence_length melody-chords are remembered
    if (latestMelodyChords.length >= sequence_length) {
        latestMelodyChords.shift();
    }
    
    // Add note to staff in DOM
    addNoteToStaff(octave, key);
}

/**
 *  Adds a note to the staff
 */
function addNoteToStaff(octave, key) {
    keyName = keys[key]; //get the alphabetic name of the key
    notes = document.getElementById("notes");
    
    // Remove the first note if there are too many notes on screen
    if (latestKeysAlphabetic.length >= num_displayed_notes) {
        latestKeysAlphabetic.shift();
        notes.firstChild.remove();
    }
    
    // Decide accent based on previous notes
    acc = "none";
    for (i = latestKeysAlphabetic.length - 1; i >= 0; i--) {
        k = latestKeysAlphabetic[i];
        if (keyName.includes("b")) { //if the key is a black key
            if (k[0] == octave && k[1] == keyName[0]) { //if there is a previous note with the same name
                if (k[2] == "flat") {
                    acc = "";
                    break;
                }
                else if (k[2] == "reset") {
                    break;
                }
                else if (k[2] == "sharp") {
                    acc = "flat";
                    break;
                }
            }
            else if (k[0] == octave && k[1] == keys[(key - 1) % 12]) { //if there is a previous corresponding sharp note
                if (k[2] == "sharp") {
                    keyName = k[1];
                    acc = "";
                    break;
                }
                if (k[2] == "reset") {
                    break;
                }
            }
        } else { //white key
            if (k[0] == octave && k[1] == keyName) { //if there is a note with the same name
                if (k[2] == "sharp" || k[2] == "flat") {
                    acc = "reset";
                    break;
                }
                if (k[2] == "reset") {
                    acc = "";
                    break;
                }
            }
        }
    }
    
    // If no accent can be decided on previous notes, decide accent based on direction
    if (acc == "none") {
        if (keyName.includes("b")) { //black key
            if (latestMelodyChords.length > 1) { //if there are any notes before
                chord_size = pitch_max - pitch_min + 1;
                if (latestMelodyChords[latestMelodyChords.length - 1].slice(chord_size).indexOf(1) <
                    latestMelodyChords[latestMelodyChords.length - 2].slice(chord_size).indexOf(1)) {
                    acc = "flat"; //flat if melody is going down
                    keyName = keyName[0];
                } else {
                    acc = "sharp"; //sharp if melody is going up
                    keyName = keys[(key - 1) % 12]; //rename from Xb to Y#
                }
            } else {
                acc = "sharp"; //sharp if there are no previous notes
                keyName = keys[(key - 1) % 12]; //rename from Xb to Y#
            }
        }
        else { //white key
            acc = "";
        }
    }
    keyName = keyName[0]; //remove 'b' if necessary
    
    // Add ledger lines
    ledger = false;
    ledger_index = 0;
    ledger_type = "";
    ledger_list = [
                    [["C", "4"], ["ledger_bottom", 0]],
                    [["B", "3"], ["ledger_bottom", 0]],
                    [["A", "3"], ["ledger_bottom", 1]],
                    [["G", "3"], ["ledger_bottom", 1]],
                    [["F", "3"], ["ledger_bottom", 2]],
                    [["A", "5"], ["ledger_top", 0]],
                    [["B", "5"], ["ledger_top", 0]],
                    [["C", "6"], ["ledger_top", 1]],
                    [["A", "6"], ["ledger_top", 0]],
                    [["B", "6"], ["ledger_top", 0]],
                    [["C", "7"], ["ledger_top", 1]],
                    [["D", "7"], ["ledger_top", 1]],
                    [["E", "7"], ["ledger_top", 2]]
                 ];
    for (i in ledger_list) {
        l = ledger_list[i];
        if (keyName == l[0][0] && octave == l[0][1]) {
            ledger = true;
            ledger_type = l[1][0];
            ledger_index = l[1][1];
        }
    }
    
    // Add 8va if necessary
    ottava = "";
    if (octave == "7" || octave == "6" && keyName != "C") {
        ottava = " octave";
    }
    
    // Add note to DOM
    note = document.createElement("div");
    if (acc == "") {
        note.setAttribute("class", "note note_" + keyName[0] + octave + ottava);
    } else {
        note.setAttribute("class", "note note_" + keyName[0] + octave + " " + acc + ottava);
    }
    if (ledger) {
        l = document.createElement("div");
        l.setAttribute("data-index", ledger_index);
        l.setAttribute("class", ledger_type);
        note.appendChild(l);
    }
    notes.appendChild(note);
    
    // Update alphabetic key memory
    latestKeysAlphabetic.push([octave, keyName, acc]);
}
