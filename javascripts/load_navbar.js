document.addEventListener('DOMContentLoaded', function() {
    const navbar = `
    <nav class="navbar">
        <div class="nav-content">
            <a href="./index.html">home</a>     
            <a href="./misc.html">misc</a>
            <a href="./nature.html">welcome to the nature</a>
        </div>
    </nav>
    `;
    document.body.insertAdjacentHTML('afterbegin', navbar);
});