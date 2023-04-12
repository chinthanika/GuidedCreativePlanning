import requests

url = 'http://localhost:5000/'
r = requests.post(url,json={'exp':1.8,})
print(r.json())