import json
import re

from flask import Flask, request, render_template
from flask_cors import CORS

from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
import math
import torch

# Create a Flask app instance and enable Cross-Origin Resource Sharing (CORS)
app = Flask(__name__)
CORS(app)


# Load the pre-trained tokenizer and sequence-to-sequence model
tokenizer = AutoTokenizer.from_pretrained("Babelscape/rebel-large")
model = AutoModelForSeq2SeqLM.from_pretrained("Babelscape/rebel-large")

# Extract relations from model output
def extract_relations_from_model_output(text):
    relations = []
    relation, subject, relation, object_ = '', '', '', ''
    text = text.strip()
    current = 'x'
    text_replaced = text.replace("<s>", "").replace("<pad>", "").replace("</s>", "")
    for token in text_replaced.split():
        # If the token is a triplet and the relation is not empty
        # set the current state to 't'
        # append a dictionary containing head, type, and tail to relations list
        if token == "<triplet>":
            current = 't'
            if relation != '':
                relations.append({
                    'head': subject.strip(),
                    'type': relation.strip(),
                    'tail': object_.strip()
                })
                relation = ''
            subject = ''
        # Else if the token is a subject and the relation is not empty
        # set the current state to 's'
        # append a dictionary containing head, type, and tail to relations list
        elif token == "<subj>":
            current = 's'
            if relation != '':
                relations.append({
                    'head': subject.strip(),
                    'type': relation.strip(),
                    'tail': object_.strip()
                })
            object_ = ''
        # Else if the token is a subject
        # se the current state to 'o' 
        # set the relation to an empty string
        elif token == "<obj>":
            current = 'o'
            relation = ''
        # Build the respective parts of the relation
        else:
            # If the current state is 't' add the token to the subject variable
            if current == 't':
                subject += ' ' + token
            # If the current state is 's' add the token to the object variable
            elif current == 's':
                object_ += ' ' + token
                # If the current state is 'o' add the token to the relation variable
            elif current == 'o':
                relation += ' ' + token
    # If the subject, relation and object all have values, append a dictionary head, type, and tail to relations list
    if subject != '' and relation != '' and object_ != '':
        relations.append({
            'head': subject.strip(),
            'type': relation.strip(),
            'tail': object_.strip()
        })
    return relations

# Represents a knowledge base of relations
class KB():
    def __init__(self):
        self.relations = [] # Initialize an empty list to hold the relations

    # Compare two relations, r1 and r2, to check if they have the same values for "head", "type", and "tail"
    def are_relations_equal(self, r1, r2):
        return all(r1[attr] == r2[attr] for attr in ["head", "type", "tail"])

    # Check if a given relation, r1, already exists in the list of relations
    def exists_relation(self, r1):
        return any(self.are_relations_equal(r1, r2) for r2 in self.relations)

    # Add a new relation, r, to the list of relations if it does not already exist
    def add_relation(self, r):
        if not self.exists_relation(r):
            self.relations.append(r)

    # Print all the relations in the list
    def print(self):
        print("Relations:")
        for r in self.relations:
            print(f"  {r}")

    # Convert the knowledge base to a JSON string
    def json_convert(self):
      json_str = json.dumps(self.relations, indent=4)
      return json_str

# Convert input text to a knowledge base of relations
def from_text_to_kb(text, span_length=128, verbose=False):
    # tokenize whole text
    inputs = tokenizer([text], return_tensors="pt")

    # compute span boundaries
    num_tokens = len(inputs["input_ids"][0])
    if verbose:
        print(f"Input has {num_tokens} tokens")
    num_spans = math.ceil(num_tokens / span_length)
    if verbose:
        print(f"Input has {num_spans} spans")
    overlap = math.ceil((num_spans * span_length - num_tokens) / 
                        max(num_spans - 1, 1))
    spans_boundaries = []
    start = 0
    for i in range(num_spans):
        spans_boundaries.append([start + span_length * i,
                                 start + span_length * (i + 1)])
        start -= overlap
    if verbose:
        print(f"Span boundaries are {spans_boundaries}")

    # transform input with spans
    tensor_ids = [inputs["input_ids"][0][boundary[0]:boundary[1]]
                  for boundary in spans_boundaries]
    tensor_masks = [inputs["attention_mask"][0][boundary[0]:boundary[1]]
                    for boundary in spans_boundaries]
    inputs = {
        "input_ids": torch.stack(tensor_ids),
        "attention_mask": torch.stack(tensor_masks)
    }

    # generate relations
    num_return_sequences = 3
    gen_kwargs = {
        "max_length": 256,
        "length_penalty": 0,
        "num_beams": 3,
        "num_return_sequences": num_return_sequences
    }
    generated_tokens = model.generate(
        **inputs,
        **gen_kwargs,
    )

    # decode relations
    decoded_preds = tokenizer.batch_decode(generated_tokens,
                                           skip_special_tokens=False)

    # create kb
    kb = KB()
    i = 0
    for sentence_pred in decoded_preds:
        current_span_index = i // num_return_sequences
        relations = extract_relations_from_model_output(sentence_pred)
        for relation in relations:
            relation["meta"] = {
                "spans": [spans_boundaries[current_span_index]]
            }
            kb.add_relation(relation)
        i += 1

    return kb

#If a user visits "/" the relationform is rendered
@app.route('/')
def show_relation_form():
    return render_template('relationform.html')

@app.route('/characters',methods=['GET', 'POST'])
def predict():
    # Get the data from the POST request.
    text = request.get_json("text")

    # Extract the relationships in the text
    prediction = from_text_to_kb(str(text))

    prediction = prediction.json_convert()

    relations = json.loads(prediction)
    print(relations)

    return prediction


if __name__ == '__main__':
    app.run(port=5000)