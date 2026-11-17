import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeRoot } from './app/ThemeRoot';
import { App } from './app/App';
import './app/styles.css';

const element = document.getElementById('root');
if (!element) throw new Error('App root is missing');
ReactDOM.createRoot(element).render(<ThemeRoot><App /></ThemeRoot>);
