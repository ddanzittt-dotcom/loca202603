import { Component } from "react"

export class MapErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.warn("지도 컴포넌트 에러:", error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="map-canvas">
          <div className="map-canvas__fallback">
            <span className="map-canvas__fallback-icon">🗺️</span>
            <span className="map-canvas__fallback-text">지도를 불러올 수 없습니다</span>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
