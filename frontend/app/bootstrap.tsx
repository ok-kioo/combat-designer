import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../shared/auth/AuthProvider';
import { AppRoutes } from './router';
import './styles.css';
createRoot(document.getElementById('root')!).render(<BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>);
