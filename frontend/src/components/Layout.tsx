import { NavLink, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark">B</span>
            <span className="brand-text">
              <span className="brand-title">Briefing</span>
              <span className="brand-sub">Studio</span>
            </span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              Главная
            </NavLink>
            <NavLink to="/briefs">Брифы</NavLink>
            <NavLink to="/brief/new">Новый бриф</NavLink>
          </nav>
          <NavLink to="/brief/new" className="btn btn--primary header-cta">
            Создать бриф
          </NavLink>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </>
  )
}
