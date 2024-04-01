import logo from './logo.svg';
import './App.css';
import { useState } from 'react';


function App() {
  const [task, setTask] = useState(''); 
  const [currentImage, setCurrentImage] = useState(0);

  return (
    <div className="App">
      <h1>Induced AI Clone</h1>
      {/* I want a chat interface here. Each chat message can have image and text both.*/}
      <div className="chat">
        <div className="chat-message">
          <img src="https://via.placeholder.com/150" alt="Chat Image" />
          <p>Hi! I am Induced AI. How can I help you?</p>
        </div>
        <div className="chat-message">
          <img src="https://via.placeholder.com/150" alt="Chat Image" />
          <p>What can I do for you?</p>
        </div>
       </div>
    </div>
  );
}

export default App;
