<?php
header('Content-Type: application/json');

ob_start();

session_start();

if (!isset($_SESSION['userData'])) {
    $_SESSION['userData'] = [
        'trackedUserIDs' => [], 
        'userDescriptions' => [] 
    ];
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (isset($input['trackedUserIDs'])) {
        $_SESSION['userData']['trackedUserIDs'] = $input['trackedUserIDs'];
    }
    if (isset($input['userDescriptions'])) {
        $_SESSION['userData']['userDescriptions'] = $input['userDescriptions'];
    }
    echo json_encode(['status' => 'success']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    ob_end_clean();
    echo json_encode($_SESSION['userData']);
    exit;
}

ob_end_clean();
