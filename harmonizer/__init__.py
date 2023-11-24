from flask import Flask, url_for, request
import torch
import torch.nn as nn
import json

app = Flask(__name__)

class RNN(nn.Module):
    
    def __init__(self, layers):
        super(RNN, self).__init__()
        self.acc_size = layers[2]
        self.rnn_mel_layers = nn.ModuleList()
        self.rnn_acc_layers = nn.ModuleList()
        self.rnn_mel_layers.append(nn.LSTM(88, layers[0][0], 1, batch_first = True))
        for i, layer in enumerate(layers[0][0:-1]):
            self.rnn_mel_layers.append(nn.LSTM(layer, layers[0][i + 1], 1, batch_first = True))
        self.rnn_acc_layers.append(nn.LSTM(layers[2], layers[1][0], 1, batch_first = True))
        for i, layer in enumerate(layers[1][0:-1]):
            self.rnn_acc_layers.append(nn.LSTM(layer, layers[1][i + 1], 1, batch_first = True))
        self.fc = nn.Linear(layers[0][-1] + layers[1][-1], layers[2])
        self.output_activation = nn.Sigmoid()
        self.training_mode = False
    
    def forward(self, x):
        y_acc = x[:, :, : self.acc_size]
        y_mel = x[:, :, self.acc_size :]
        for layer in self.rnn_mel_layers:
            y_mel, (h, c) = layer(y_mel)
        for layer in self.rnn_acc_layers:
            y_acc, (h, c) = layer(y_acc)
        y = self.fc(torch.cat((y_acc[:, -1, :], y_mel[:, -1, :]), 1))
        if not self.training_mode:
            y = self.output_activation(y)
        return y
    
    def train(self):
        self.training_mode = True
    
    def test(self):
        self.training_mode = False

loaded_model = torch.load("model.pt")
net = RNN(loaded_model["structure"])
net.load_state_dict(loaded_model["model"])
pitch_min = loaded_model["range"][0]

def generate_HTML():
    HTML = []
    HTML.append("<html>")
    HTML.append("    <head>")
    HTML.append("        <link rel=\"stylesheet\" href=\"" + url_for('static', filename='stylesheet.css') + "\" />")
    HTML.append("        <script src=\"" + url_for('static', filename='jquery.js') + "\"></script>")
    HTML.append("    </head>")
    HTML.append("    <body>")
    HTML.append("        <div class=\"container\">")
    HTML.append("            <div class=\"header\">LSTM Harmonizer</div>")
    HTML.append("            <div class=\"staff\">")
    for i in range(5):
        HTML.append("                <div class=\"line\"></div>")
    HTML.append("                <div class=\"clef\"></div>")
    HTML.append("                <div id=\"notes\" class=\"notes\"></div>")
    HTML.append("            </div>")
    HTML.append("            <div class=\"key_glow\"></div>")
    HTML.append("            <div class=\"piano_container\">")
    HTML.append("                <div class=\"piano\" onmousedown=\"keyPressed(event)\">")
    
    keys = ["F", "Gb", "G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb", "E"]
    black_white = ["white", "black", "white", "black",
                   "white", "black", "white", "white",
                   "black", "white", "black", "white"]
    
    for octave in range(3, 7):
        for i, key in enumerate(keys):
            color = black_white[i % 12]
            key_number = octave if i % 12 < keys.index("C") else octave + 1
            face_side = "right" if octave < 5 else "left"
            HTML.append(f"                    <div id=\"{key}{key_number}\" class=\"key {color} {key}\">")
            if color == "white":
                HTML.append(f"                       <div class=\"face {face_side}\"></div>")
                HTML.append("                        <div class=\"face up_back\"></div>")
                HTML.append("                        <div class=\"face up_front\"></div>")
            else:
                HTML.append("                        <div class=\"face right\"></div>")
                HTML.append("                        <div class=\"face left\"></div>")
                HTML.append("                        <div class=\"face up\"></div>")
            HTML.append("                        <div class=\"face front\"></div>")
            if color == "black":
                HTML.append("                        <div class=\"face front_bottom\"></div>")
            HTML.append("                    </div>")
    HTML.append("                </div>")
    HTML.append("            </div>")
    HTML.append("        </div>")
    HTML.append("        <script src=\"" + url_for('static',filename='piano.js') + "\"></script>")
    HTML.append("    </body>")
    HTML.append("</html>")
    return "\n".join(HTML)

@app.route('/')
def piano():
    return generate_HTML()

@app.route('/predict', methods = ['POST'])
def predict():
    threshold = 0.5
    input_vector = json.loads(request.form['sequence'])
    input_tensor = torch.FloatTensor(input_vector).unsqueeze(0)
    output = net(input_tensor).squeeze().detach().cpu().numpy()
    pitches = [i + pitch_min for i, v in enumerate(output) if v > threshold]
    return json.dumps(pitches)
