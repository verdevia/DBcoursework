const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const port = 3000;

// Підключення до бази даних MySQL
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Hol9axf6!',
  database: 'onlinepharmacy'
});

app.use(require('express-session')({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// Перевірка підключення до бази даних
db.connect((err) => {
  if (err) {
    console.error('Помилка підключення до бази даних:', err.stack);
    return;
  }
  console.log('Підключено до бази даних MySQL');
});

// Для парсингу даних з форми
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Для підтримки сесій
app.use(session({
  secret: 'secret_key',
  resave: false,
  saveUninitialized: true
}));

// Вказуємо папку для статичних файлів
app.use(express.static(path.join(__dirname, 'html')));

// Ручка для реєстрації
app.post('/register', (req, res) => {
  const { username, pwd, mail } = req.body;

  // Перевірка чи користувач вже існує
  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      return res.redirect('/reg.html?error=Помилка запиту до бази даних');
    }

    if (results.length > 0) {
      return res.redirect('/reg.html?error=Користувач з таким логіном вже існує');
    }

    // Додавання нового користувача до бази даних
    db.query('INSERT INTO users (username, password, email) VALUES (?, ?, ?)', [username, pwd, mail], (err, result) => {
      if (err) {
        return res.redirect('/reg.html?error=Помилка при реєстрації користувача');
      }

      // Після успішної реєстрації, зберігаємо користувача в сесії
      req.session.user = { username, email: mail };

      // Перенаправлення на сторінку входу
      res.redirect('/main.html');
    });
  });
});

// Ручка для входу
app.post('/login', (req, res) => {
  const { username, pwd } = req.body;

  db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, pwd], (err, results) => {
    if (err) {
      return res.redirect('/ent.html?error=Помилка запиту до бази даних');
    }

    if (results.length === 0) {
      return res.redirect('/ent.html?error=Неправильний логін або пароль');
    }

    // Збереження сесії після успішного входу
    req.session.user = { username: results[0].username, email: results[0].email };

    // Перенаправлення на головну сторінку
    res.redirect('/main.html');
  });
});

// Ручка для виходу
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect('/main.html');
    }
    res.redirect('/main.html');
  });
});

// Ручка для перевірки статусу сесії
app.get('/session-status', (req, res) => {
  if (req.session.user) {
      return res.json({ isLoggedIn: true, username: req.session.user.username });
  } else {
      return res.json({ isLoggedIn: false });
  }
});

// Ручка для отримання даних користувача
app.get('/user-data', (req, res) => {
  if (!req.session.user) {
    return res.status(403).json({ message: 'Немає доступу' });
  }

  const query = 'SELECT username, email, phone_number, address, role FROM users WHERE username = ?';
  db.query(query, [req.session.user.username], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Помилка на сервері' });
    }
    const user = results[0];
    res.json(user);
  });
});

// Ручка для оновлення номеру телефону та адреси
app.post('/update-user', (req, res) => {
    if (!req.session.user) {
      return res.status(403).json({ message: 'Немає доступу' });
    }
  
    const { phone_number, address } = req.body;
  
    // Додамо логування, щоб перевірити, чи отримуємо значення
    console.log('Отримано дані для оновлення:', phone_number, address);
  
    if (!phone_number || !address) {
      return res.status(400).json({ message: 'Не всі поля заповнені' });
    }
  
    const query = 'UPDATE users SET phone_number = ?, address = ? WHERE username = ?';
    db.query(query, [phone_number, address, req.session.user.username], (err, results) => {
      if (err) {
        console.error('Помилка запиту до бази даних:', err); // Логування помилки
        return res.status(500).json({ message: 'Помилка на сервері' });
      }
  
      // Перевіряємо, чи був оновлений хоча б один рядок
      if (results.affectedRows > 0) {
        res.json({ message: 'Дані оновлено' });
      } else {
        res.status(400).json({ message: 'Нічого не змінено, можливо, дані вже актуальні' });
      }
    });
  });

  app.post('/api/add-to-cart', (req, res) => {
    const { product_id, quantity } = req.body;

    // Перевірка, чи є користувач у сесії
    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Будь ласка, увійдіть у систему перед додаванням товару до кошика' });
    }

    const username = req.session.user.username; // Отримуємо username з сесії

    // Запит для отримання user_id за username
    const query = 'SELECT user_id FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Помилка при отриманні user_id' });
        }

        if (results.length > 0) {
            const user_id = results[0].user_id;

            // Перевірка наявної кількості товару на складі
            const checkStockQuery = 'SELECT quantity_in_stock FROM products WHERE product_id = ?';
            db.query(checkStockQuery, [product_id], (err, stockResults) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Помилка при перевірці наявності товару' });
                }

                if (stockResults.length === 0) {
                    return res.status(404).json({ success: false, message: 'Товар не знайдений' });
                }

                const availableQuantity = stockResults[0].quantity_in_stock;

                // Перевірка, чи не перевищує кількість на складі
                if (quantity > availableQuantity) {
                    return res.status(400).json({ success: false, message: 'Запитувана кількість товару перевищує наявну' });
                }

                // Перевірка, чи товар вже є в кошику
                const checkQuery = 'SELECT * FROM cart WHERE user_id = ? AND product_id = ?';
                db.query(checkQuery, [user_id, product_id], (err, checkResults) => {
                    if (err) {
                        return res.status(500).json({ success: false, message: 'Помилка при перевірці кошика' });
                    }

                    if (checkResults.length > 0) {
                        // Якщо товар є в кошику, збільшуємо кількість
                        const newQuantity = checkResults[0].quantity + parseInt(quantity, 10); // Переконатися, що кількість числова
                        if (newQuantity > availableQuantity) {
                            return res.status(400).json({ success: false, message: 'Запитувана кількість товару перевищує наявну' });
                        }

                        const updateQuery = 'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?';
                        db.query(updateQuery, [newQuantity, user_id, product_id], (err) => {
                            if (err) {
                                return res.status(500).json({ success: false, message: 'Помилка при оновленні кошика' });
                            }
                            res.json({ success: true, message: 'Кількість товару в кошику оновлено' });
                        });
                    } else {
                        // Якщо товару ще немає, додаємо його в кошик
                        const insertQuery = 'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)';
                        db.query(insertQuery, [user_id, product_id, quantity], (err) => {
                            if (err) {
                                return res.status(500).json({ success: false, message: 'Помилка при додаванні товару до кошика' });
                            }
                            res.json({ success: true, message: 'Товар додано до кошика' });
                        });
                    }
                });
            });
        } else {
            res.status(404).json({ success: false, message: 'Користувач не знайдений' });
        }
    });
});

// Ручка для отримання продуктів
app.get('/api/products', (req, res) => {
  db.query('SELECT * FROM Products', (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Помилка запиту до бази даних' });
    }
    res.json(results);
  });
});

// Ручка для відображення головної сторінки
app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'main.html'));
});

// Запуск сервера
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
