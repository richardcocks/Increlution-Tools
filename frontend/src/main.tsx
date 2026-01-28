import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import '@fortawesome/fontawesome-free/css/all.min.css'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/Toast.tsx'
import { Footer } from './components/Footer.tsx'
import { AuthProvider } from './contexts/AuthContext.tsx'
import { GameDataProvider } from './contexts/GameDataContext.tsx'
import { SettingsProvider } from './contexts/SettingsContext.tsx'
import { ThemeProvider } from './contexts/ThemeContext.tsx'
import { SavedSharesProvider } from './contexts/SavedSharesContext.tsx'
import { ProtectedRoute } from './components/ProtectedRoute.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { LandingPage } from './pages/LandingPage.tsx'
import AboutPage from './pages/AboutPage.tsx'
import TermsPage from './pages/TermsPage.tsx'
import { AuthAwareShareRoute } from './components/AuthAwareShareRoute.tsx'
import { AuthAwareFolderShareRoute } from './components/AuthAwareFolderShareRoute.tsx'
import { DeleteAccountPage } from './pages/DeleteAccountPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <ThemeProvider>
          <SavedSharesProvider>
            <ToastProvider>
              <div className="app-wrapper">
                <div className="app-content">
                  <Routes>
                    <Route path="/" element={<LandingPage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<Navigate to="/login" replace />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/share/:token" element={
                      <GameDataProvider>
                        <AuthAwareShareRoute />
                      </GameDataProvider>
                    } />
                    <Route path="/share/folder/:token" element={
                      <GameDataProvider>
                        <AuthAwareFolderShareRoute />
                      </GameDataProvider>
                    } />
                    {/* User's own folders and loadouts */}
                    <Route path="/loadouts/folder/:folderId" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    <Route path="/loadouts/loadout/:loadoutId" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    {/* Saved shared content (embedded view for logged-in users) */}
                    <Route path="/loadouts/shared/:token" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    <Route path="/loadouts/shared/folder/:folderToken/:loadoutId" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    <Route path="/loadouts/shared/folder/:folderToken" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    {/* Root loadouts view */}
                    <Route path="/loadouts" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    <Route path="/settings" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    <Route path="/favourites" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    <Route path="/shares" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    <Route path="/help" element={
                      <ProtectedRoute>
                        <GameDataProvider>
                          <App />
                        </GameDataProvider>
                      </ProtectedRoute>
                    } />
                    <Route path="/delete-account" element={
                      <ProtectedRoute>
                        <DeleteAccountPage />
                      </ProtectedRoute>
                    } />
                  </Routes>
                </div>
                <Footer />
              </div>
            </ToastProvider>
          </SavedSharesProvider>
          </ThemeProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
