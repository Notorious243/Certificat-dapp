import React from "react";

export function GridBackground() {
    return (
        <div className="absolute inset-0 h-full w-full bg-white bg-dot-black/[0.2] flex items-center justify-center -z-10">
            {/* Radial gradient for the container to give a faded look */}
            <div className="absolute pointer-events-none inset-0 flex items-center justify-center bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]"></div>
        </div>
    );
}
