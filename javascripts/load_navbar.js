document.addEventListener('DOMContentLoaded', function() {
    const navbar = `
    <nav class="navbar">
        <div class="nav-content">
            <a href="./index.html">home</a>
            <a href="./bio.html">bio</a>
            <a href="./publications.html">publications</a>
            <a href="./cv.html">cv</a>
            <a href="./misc.html">misc</a>
        </div>
    </nav>
    `;
    document.body.insertAdjacentHTML('afterbegin', navbar);
});