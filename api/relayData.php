<?php
phpinfo();
header('Content-Type: application/json');

// Lê os dados recebidos do frontend
$input = json_decode(file_get_contents('php://input'), true);

// Simplesmente retransmite os dados recebidos
echo json_encode($input);
?>
