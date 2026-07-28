import cytoscape from 'cytoscape';
import coseBilkent from 'cytoscape-cose-bilkent';
import 'katex/dist/katex.min.css';
import './styles.css';
import { startAtlasApp } from './app/atlas-app.js';

coseBilkent(cytoscape);
void startAtlasApp();
