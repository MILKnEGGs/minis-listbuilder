import { mount } from 'svelte';
import App from '@milk/minis-core/App.svelte';
import '@milk/minis-core/style.css';
import './theme.css';
import { game } from './game';

export default mount(App, { target: document.getElementById('app')!, props: { game } });
